import { agora, db, normalizar, novoId } from '../database.js';
import { ErroApi } from '../erros.js';
import { obterSessao } from './sessoes.js';

const LIMITE_POR_HORA = 5;
const enviosRecentes = new Map(); // session_id -> horários dos últimos envios (memória; zera ao reiniciar)

function respeitaLimite(sessionId) {
  const umaHoraAtras = Date.now() - 60 * 60_000;
  const recentes = (enviosRecentes.get(sessionId) ?? []).filter((t) => t > umaHoraAtras);
  if (recentes.length >= LIMITE_POR_HORA) return false;
  enviosRecentes.set(sessionId, [...recentes, Date.now()]);
  return true;
}

// Sugestões iguais (ignorando acento e caixa) viram uma só; cada sessão vota uma vez.
export const sugerir = db.transaction((sessionId, textoBruto) => {
  if (!sessionId || !obterSessao(sessionId)) throw new ErroApi(404, 'Sessão não encontrada');

  const texto = String(textoBruto ?? '').replace(/\s+/g, ' ').trim();
  if (texto.length < 3 || texto.length > 120) throw new ErroApi(400, 'Escreva o nome da música ou artista (3 a 120 letras).');
  if (!respeitaLimite(sessionId)) throw new ErroApi(429, 'Você já enviou várias sugestões. Tente de novo mais tarde.');

  const chave = normalizar(texto);
  let sugestao = db.prepare("SELECT id FROM sugestoes_clientes WHERE chave = ? AND status = 'novo'").get(chave);
  if (!sugestao) {
    const id = novoId();
    db.prepare('INSERT INTO sugestoes_clientes (id, texto, chave, status, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, texto, chave, 'novo', agora(), agora());
    sugestao = { id };
  }

  db.prepare('INSERT OR IGNORE INTO sugestoes_votos (sugestao_id, session_id) VALUES (?, ?)').run(sugestao.id, sessionId);
  db.prepare('UPDATE sugestoes_clientes SET atualizado_em = ? WHERE id = ?').run(agora(), sugestao.id);
  return { pedidos: db.prepare('SELECT COUNT(*) AS n FROM sugestoes_votos WHERE sugestao_id = ?').get(sugestao.id).n };
});

export function listar(status = 'novo') {
  const filtro = ['novo', 'atendido', 'descartado'].includes(status) ? 'WHERE s.status = ?' : '';
  return db.prepare(`
    SELECT s.id, s.texto, s.status, s.criado_em, s.atualizado_em,
           (SELECT COUNT(*) FROM sugestoes_votos v WHERE v.sugestao_id = s.id) AS pedidos
      FROM sugestoes_clientes s ${filtro}
     ORDER BY pedidos DESC, s.atualizado_em DESC
     LIMIT 200
  `).all(...(filtro ? [status] : []));
}

export function atualizarStatus(id, status) {
  if (!['novo', 'atendido', 'descartado'].includes(status)) throw new ErroApi(400, 'Status inválido');
  const resultado = db.prepare('UPDATE sugestoes_clientes SET status = ?, atualizado_em = ? WHERE id = ?').run(status, agora(), id);
  if (!resultado.changes) throw new ErroApi(404, 'Sugestão não encontrada');
}
