import crypto from 'node:crypto';
import { db, agora, novoId, SESSAO_SISTEMA } from '../database.js';
import { config } from '../config.js';

const novaExpiracao = () => new Date(Date.now() + config.sessaoTtlMin * 60_000).toISOString();

export function criarSessao() {
  const id = novoId();
  db.prepare('INSERT INTO sessoes (id, saldo, criado_em, expira_em) VALUES (?, 0, ?, ?)')
    .run(id, agora(), novaExpiracao());
  return obterSessao(id);
}

// `saldo` é o total que o cliente pode gastar (pago + cortesia); `saldo_cortesia` é a parte grátis.
// Créditos vencidos são zerados na leitura, sem depender do job rodar antes.
export function obterSessao(id) {
  if (!id || id === SESSAO_SISTEMA) return null;
  const sessao = db.prepare('SELECT * FROM sessoes WHERE id = ?').get(id);
  if (!sessao) return null;

  if ((sessao.saldo > 0 || sessao.saldo_cortesia > 0) && sessao.expira_em < agora()) {
    db.prepare('UPDATE sessoes SET saldo = 0, saldo_cortesia = 0 WHERE id = ?').run(id);
    sessao.saldo = 0;
    sessao.saldo_cortesia = 0;
  }

  const total = sessao.saldo + sessao.saldo_cortesia;
  const restanteMs = Date.parse(sessao.expira_em) - Date.now();
  return {
    id: sessao.id,
    saldo: total,
    saldo_cortesia: sessao.saldo_cortesia,
    expira_em: sessao.expira_em,
    minutos_restantes: total > 0 ? Math.max(0, Math.ceil(restanteMs / 60_000)) : 0,
  };
}

// Pagamento, reembolso e cortesia renovam o prazo; saldo vencido que ainda não foi zerado não é somado.
export function creditar(id, pago, cortesia = 0) {
  const agoraIso = agora();
  db.prepare(`
    UPDATE sessoes
       SET saldo = CASE WHEN expira_em < @agora THEN 0 ELSE saldo END + @pago,
           saldo_cortesia = CASE WHEN expira_em < @agora THEN 0 ELSE saldo_cortesia END + @cortesia,
           expira_em = @expira
     WHERE id = @id
  `).run({ agora: agoraIso, pago, cortesia, expira: novaExpiracao(), id });
}

// Gasta primeiro a cortesia e só então o saldo pago. Retorna quanto saiu de cada um
// ({ cortesia, pago }) ou null se não há saldo suficiente ou a sessão venceu.
export function debitar(id, creditos) {
  const sessao = db.prepare('SELECT saldo, saldo_cortesia, expira_em FROM sessoes WHERE id = ?').get(id);
  if (!sessao || sessao.expira_em < agora()) return null;

  const cortesia = Math.min(sessao.saldo_cortesia, creditos);
  const pago = creditos - cortesia;
  if (sessao.saldo < pago) return null;

  db.prepare('UPDATE sessoes SET saldo = saldo - ?, saldo_cortesia = saldo_cortesia - ?, expira_em = ? WHERE id = ?')
    .run(pago, cortesia, novaExpiracao(), id);
  return { cortesia, pago };
}

export function expirarSessoes() {
  const vencidas = db.prepare('SELECT id FROM sessoes WHERE (saldo > 0 OR saldo_cortesia > 0) AND expira_em < ?').all(agora());
  if (vencidas.length) {
    db.prepare('UPDATE sessoes SET saldo = 0, saldo_cortesia = 0 WHERE (saldo > 0 OR saldo_cortesia > 0) AND expira_em < ?').run(agora());
  }
  return vencidas.map((s) => s.id);
}

// Sessões abandonadas (nunca pagaram nem tocaram nada) não precisam ficar no banco.
export function limparSessoesVazias() {
  const limite = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  db.prepare(`
    DELETE FROM sessoes
     WHERE saldo = 0 AND saldo_cortesia = 0 AND expira_em < ?
       AND NOT EXISTS (SELECT 1 FROM pagamentos p WHERE p.session_id = sessoes.id)
       AND NOT EXISTS (SELECT 1 FROM fila f WHERE f.session_id = sessoes.id)
  `).run(limite);
}

// Nome anônimo estável pra mostrar na fila sem expor o id da sessão (que vale como senha).
export function rotulo(sessionId) {
  if (sessionId === SESSAO_SISTEMA) return 'Playlist automática';
  const hash = crypto.createHash('sha1').update(String(sessionId)).digest('hex');
  return `Convidado ${hash.slice(0, 4).toUpperCase()}`;
}
