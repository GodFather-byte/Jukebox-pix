import { db, agora, novoId, ehSessaoInterna, SESSAO_CASA, SESSAO_SISTEMA } from '../database.js';
import { config } from '../config.js';
import { ErroApi } from '../erros.js';
import { precoEfetivo, VISIVEL } from './catalogo.js';
import * as configuracoes from './configuracoes.js';
import { creditar, debitar, obterSessao, rotulo } from './sessoes.js';

const ITEM_SELECT = `
  SELECT f.id, f.session_id, f.posicao, f.status, f.creditos, f.creditos_cortesia, f.prioridade, f.iniciado_em, f.fim_previsto_em,
         m.id AS musica_id, m.titulo, m.duracao, m.arquivo, m.lufs, m.pico_db,
         c.titulo AS cd, COALESCE(m.capa, c.capa) AS capa, a.nome AS artista, cat.icone, cat.cor
    FROM fila f
    JOIN musicas m ON m.id = f.musica_id
    JOIN cds c ON c.id = m.cd_id
    JOIN artistas a ON a.id = c.artista_id
    JOIN categorias cat ON cat.id = c.categoria_id
`;

const contar = (sql, ...parametros) => db.prepare(sql).get(...parametros).total;

// Todas as regras são checadas ANTES de cobrar: pedido recusado não gasta crédito.
export const adicionar = db.transaction((sessionId, musicaId, { prioridade = false } = {}) => {
  if (!sessionId || !obterSessao(sessionId)) throw new ErroApi(404, 'Sessão não encontrada');

  // Música ou CD ocultos pelo dono não podem mais ser pedidos.
  const musica = db.prepare(`
    SELECT m.id, m.creditos, c.status AS cd_status FROM musicas m JOIN cds c ON c.id = m.cd_id WHERE m.id = ? AND ${VISIVEL}
  `).get(musicaId);
  if (!musica) throw new ErroApi(404, 'Música não encontrada');

  const regras = configuracoes.lerRegras();

  if (contar("SELECT COUNT(*) AS total FROM fila WHERE status IN ('aguardando', 'tocando')") >= config.filaMax) {
    throw new ErroApi(409, 'A fila está cheia. Tente de novo daqui a pouco.', 'FILA_CHEIA');
  }

  const limitePessoa = regras.max_pedidos_por_pessoa;
  if (limitePessoa > 0 && contar("SELECT COUNT(*) AS total FROM fila WHERE session_id = ? AND status IN ('aguardando', 'tocando')", sessionId) >= limitePessoa) {
    throw new ErroApi(409, `Você já tem ${limitePessoa} ${limitePessoa === 1 ? 'música' : 'músicas'} na fila. Aguarde uma tocar para pedir outra.`, 'LIMITE_PEDIDOS');
  }

  // Músicas da playlist automática não contam: o cliente não escolheu aquela repetição.
  if (regras.bloquear_repeticao_min > 0) {
    const desde = new Date(Date.now() - regras.bloquear_repeticao_min * 60_000).toISOString();
    const repetida = contar(`
      SELECT COUNT(*) AS total FROM fila
       WHERE musica_id = ? AND session_id <> ?
         AND (status IN ('aguardando', 'tocando') OR (status = 'tocado' AND iniciado_em >= ?))
    `, musicaId, SESSAO_SISTEMA, desde);
    if (repetida) throw new ErroApi(409, 'Essa música já está na fila ou tocou há pouco. Escolha outra!', 'REPETIDA');
  }

  let custo = precoEfetivo(musica);
  if (prioridade) {
    if (!regras.prioridade.ativa) throw new ErroApi(400, 'A fila prioritária não está disponível agora.', 'PRIORIDADE_INDISPONIVEL');
    if (contar("SELECT COUNT(*) AS total FROM fila WHERE prioridade = 1 AND status = 'aguardando'") >= regras.prioridade.limite) {
      throw new ErroApi(409, 'Já há muitos pedidos prioritários esperando. Peça pela fila normal.', 'PRIORIDADE_CHEIA');
    }
    custo += regras.prioridade.extra;
  }

  const gasto = debitar(sessionId, custo);
  if (!gasto) {
    throw new ErroApi(402, 'Saldo insuficiente. Adicione créditos para continuar.', 'SALDO_INSUFICIENTE');
  }

  const { proxima } = db.prepare('SELECT COALESCE(MAX(posicao), 0) + 1 AS proxima FROM fila').get();
  const id = novoId();
  db.prepare(`
    INSERT INTO fila (id, session_id, musica_id, posicao, creditos, creditos_cortesia, prioridade, status, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'aguardando', ?)
  `).run(id, sessionId, musicaId, proxima, custo, gasto.cortesia, prioridade ? 1 : 0, agora());

  // Sorteio de crédito: só música paga concorre; o prêmio é cortesia (não entra no faturamento).
  const aCada = regras.sorteio.a_cada;
  const premio = aCada > 0 && gasto.pago > 0 && sortear() < 1 / aCada ? 1 : 0;
  if (premio) creditar(sessionId, 0, premio);

  return { id, saldo: obterSessao(sessionId).saldo, premio };
});

let sortear = Math.random;
// Só para os testes: troca o sorteio por um número fixo.
export const definirSorteio = (funcao) => { sortear = funcao; };

// Música da internet: o valor foi cobrado no pedido (antes do download), então aqui ela só entra na fila.
// Os valores guardados valem para o reembolso, se ela for removida ou falhar.
export function adicionarPaga(sessionId, musicaId, { creditos, cortesia }) {
  const { proxima } = db.prepare('SELECT COALESCE(MAX(posicao), 0) + 1 AS proxima FROM fila').get();
  const id = novoId();
  db.prepare(`
    INSERT INTO fila (id, session_id, musica_id, posicao, creditos, creditos_cortesia, prioridade, status, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, 0, 'aguardando', ?)
  `).run(id, sessionId, musicaId, proxima, creditos, cortesia, agora());
  return id;
}

function paraCliente(item, sessionId, esperaSegundos) {
  return {
    id: item.id,
    posicao: item.posicao,
    status: item.status,
    iniciado_em: item.iniciado_em,
    fim_previsto_em: item.fim_previsto_em,
    espera_segundos: esperaSegundos,
    quem: rotulo(item.session_id),
    minha: item.session_id === sessionId,
    automatica: item.session_id === SESSAO_SISTEMA,
    trecho_seg: item.session_id === SESSAO_SISTEMA ? configuracoes.automaticoTrechoSeg() : 0,
    casa: item.session_id === SESSAO_CASA,
    prioridade: Boolean(item.prioridade),
    musica: {
      id: item.musica_id,
      titulo: item.titulo,
      duracao: item.duracao,
      artista: item.artista,
      cd: item.cd,
      capa: item.capa,
      icone: item.icone,
      cor: item.cor,
    },
  };
}

export function listar(sessionId = null, limite = 30) {
  const itens = db.prepare(`${ITEM_SELECT} WHERE f.status IN ('tocando', 'aguardando') ORDER BY f.status = 'tocando' DESC, f.prioridade DESC, f.posicao`).all();

  const atual = itens.find((i) => i.status === 'tocando') ?? null;
  let acumulado = atual?.fim_previsto_em ? Math.max(0, Math.round((Date.parse(atual.fim_previsto_em) - Date.now()) / 1000)) : 0;

  const aguardando = itens.filter((i) => i.status === 'aguardando').map((item) => {
    const espera = acumulado;
    acumulado += item.duracao ?? 0;
    return paraCliente(item, sessionId, espera);
  });

  return {
    agora_tocando: atual ? paraCliente(atual, sessionId, 0) : null,
    fila: aguardando.slice(0, limite),
    total_aguardando: aguardando.length,
  };
}

export function proximo() {
  return db.prepare(`${ITEM_SELECT} WHERE f.status = 'aguardando' ORDER BY f.prioridade DESC, f.posicao LIMIT 1`).get() ?? null;
}

export function marcarTocando(id, fimPrevistoEm) {
  db.prepare("UPDATE fila SET status = 'tocando', iniciado_em = ?, fim_previsto_em = ? WHERE id = ?")
    .run(agora(), fimPrevistoEm, id);
}

// Playlist automática e pedidos da casa não são demanda de cliente: não entram no ranking nem no faturamento.
// Em `historico_reproducao`, `creditos` é só a parte paga (base da divisão com a boate) e
// `cortesia` a parte gratuita.
export const concluir = db.transaction((item) => {
  db.prepare("UPDATE fila SET status = 'tocado' WHERE id = ?").run(item.id);
  if (ehSessaoInterna(item.session_id)) return;

  db.prepare('UPDATE musicas SET vezes_tocada = vezes_tocada + 1 WHERE id = ?').run(item.musica_id);
  db.prepare('INSERT INTO historico_reproducao (id, musica_id, session_id, creditos, cortesia, tocado_em) VALUES (?, ?, ?, ?, ?, ?)')
    .run(novoId(), item.musica_id, item.session_id, item.creditos - item.creditos_cortesia, item.creditos_cortesia, agora());
});

// O reembolso volta para o mesmo saldo de onde saiu (pago ou cortesia).
const reembolsar = (item) => creditar(item.session_id, item.creditos - item.creditos_cortesia, item.creditos_cortesia);

// Música que não tocou (arquivo sumiu, player quebrou) devolve o crédito pro cliente.
export const falhar = db.transaction((item) => {
  db.prepare("UPDATE fila SET status = 'erro' WHERE id = ?").run(item.id);
  if (!ehSessaoInterna(item.session_id)) reembolsar(item);
});

export const remover = db.transaction((id) => {
  const item = db.prepare("SELECT * FROM fila WHERE id = ? AND status = 'aguardando'").get(id);
  if (!item) return null;
  db.prepare('DELETE FROM fila WHERE id = ?').run(id);
  if (!ehSessaoInterna(item.session_id)) reembolsar(item);
  return item;
});

// Sorteia uma música para tocar quando ninguém pediu nada, evitando as tocadas há pouco.
// A faixa entra na fila como pertencente à sessão interna (sem custo).
// `categorias` limita o sorteio ([] = qualquer uma); se a restrição não achar nada, sorteia de todas.
const TOP_DA_CASA = 40; // "mais tocadas" para a aleatória: as 40 com mais reproduções

export function criarAutomatico(recentes = [], categorias = [], { soTop = false } = {}) {
  // Músicas baixadas da internet só entram no sorteio se o dono permitiu (padrão: não).
  const comInternet = configuracoes.lerYoutube().automatica;
  const sortear = (evitar, apenas, top = false) => {
    const condicoes = [VISIVEL];
    if (!comInternet) condicoes.push('m.youtube_id IS NULL');
    if (top) {
      condicoes.push(`m.vezes_tocada > 0 AND m.id IN (SELECT id FROM musicas ORDER BY vezes_tocada DESC LIMIT ${TOP_DA_CASA})`);
    }
    const parametros = [];
    if (evitar.length) {
      condicoes.push(`m.id NOT IN (${evitar.map(() => '?').join(',')})`);
      parametros.push(...evitar);
    }
    if (apenas.length) {
      condicoes.push(`c.categoria_id IN (${apenas.map(() => '?').join(',')})`);
      parametros.push(...apenas);
    }
    return db.prepare(`
      SELECT m.id FROM musicas m JOIN cds c ON c.id = m.cd_id
       WHERE ${condicoes.join(' AND ')} ORDER BY RANDOM() LIMIT 1
    `).get(...parametros);
  };
  // Só as mais tocadas, se pedido. Se todas já tocaram há pouco (ou a casa é nova, sem histórico), sorteia do
  // acervo: repetir a mesma "mais tocada" toda hora cansa mais do que tocar uma qualquer.
  const musica = (soTop && sortear(recentes, categorias, true))
    || sortear(recentes, categorias) || sortear([], categorias) || sortear([], []);
  if (!musica) return null;

  const { proxima } = db.prepare('SELECT COALESCE(MAX(posicao), 0) + 1 AS proxima FROM fila').get();
  const id = novoId();
  db.prepare(`
    INSERT INTO fila (id, session_id, musica_id, posicao, creditos, creditos_cortesia, status, criado_em)
    VALUES (?, ?, ?, ?, 0, 0, 'aguardando', ?)
  `).run(id, SESSAO_SISTEMA, musica.id, proxima, agora());
  return db.prepare(`${ITEM_SELECT} WHERE f.id = ?`).get(id);
}

// Pedido do dono (grátis, fora do faturamento). Ignora limites e regras de repetição; `aSeguir`
// põe à frente de todos (inclusive dos prioritários pagos), senão entra no fim da fila.
export const adicionarDaCasa = db.transaction((musicaId, { aSeguir = false } = {}) => {
  if (!db.prepare('SELECT 1 FROM musicas WHERE id = ?').get(musicaId)) throw new ErroApi(404, 'Música não encontrada');

  const { proxima } = db.prepare('SELECT COALESCE(MAX(posicao), 0) + 1 AS proxima FROM fila').get();
  const id = novoId();
  db.prepare(`
    INSERT INTO fila (id, session_id, musica_id, posicao, creditos, creditos_cortesia, prioridade, status, criado_em)
    VALUES (?, ?, ?, ?, 0, 0, ?, 'aguardando', ?)
  `).run(id, SESSAO_CASA, musicaId, proxima, aSeguir ? 2 : 0, agora());
  return { id };
});

// Se o servidor caiu no meio de uma música, ela volta pro começo da fila (o cliente já pagou).
// Faixas da playlist automática são descartadas: o player sorteia outra.
export function recuperarTocando() {
  db.prepare("DELETE FROM fila WHERE session_id = ? AND status IN ('tocando', 'aguardando')").run(SESSAO_SISTEMA);
  db.prepare("UPDATE fila SET status = 'aguardando', iniciado_em = NULL, fim_previsto_em = NULL WHERE status = 'tocando'").run();
}

export function limparAntigos() {
  const limite = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  db.prepare("DELETE FROM fila WHERE status IN ('tocado', 'erro') AND criado_em < ?").run(limite);
}
