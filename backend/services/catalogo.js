import { db, normalizar } from '../database.js';

// Música ou CD ocultos pelo dono nunca aparecem pro cliente (nem tocam na playlist automática).
export const VISIVEL = 'm.oculta = 0 AND c.oculto = 0';

const MUSICA_SELECT = `
  SELECT m.id, m.titulo, m.duracao, m.creditos, m.vezes_tocada, m.cd_id, m.oculta, c.oculto AS cd_oculto,
         c.titulo AS cd, c.capa,
         a.id AS artista_id, a.nome AS artista,
         cat.id AS categoria_id, cat.nome AS categoria, cat.icone, cat.cor
    FROM musicas m
    JOIN cds c ON c.id = m.cd_id
    JOIN artistas a ON a.id = c.artista_id
    JOIN categorias cat ON cat.id = c.categoria_id
`;

const CD_SELECT = `
  SELECT c.id, c.titulo, c.ano, c.capa, c.status, c.data_lancamento,
         a.id AS artista_id, a.nome AS artista,
         cat.id AS categoria_id, cat.nome AS categoria, cat.icone, cat.cor,
         (SELECT COUNT(*) FROM musicas m WHERE m.cd_id = c.id AND m.oculta = 0) AS total_musicas
    FROM cds c
    JOIN artistas a ON a.id = c.artista_id
    JOIN categorias cat ON cat.id = c.categoria_id
`;

const DIA_MS = 24 * 60 * 60 * 1000;

function comContagem(cd) {
  if (cd.status === 'novo') {
    cd.dias_restantes = Math.max(0, Math.ceil((Date.parse(cd.data_lancamento) - Date.now()) / DIA_MS));
  }
  return cd;
}

// CDs 'novo' só aparecem em LANÇAMENTOS; ao virar 'lancado' passam a aparecer nas categorias.
export function listarCategorias() {
  return db.prepare(`
    SELECT cat.id, cat.nome, cat.icone, cat.cor,
           (SELECT COUNT(DISTINCT c.artista_id) FROM cds c
             WHERE c.categoria_id = cat.id AND c.status = 'lancado' AND c.oculto = 0) AS total_artistas
      FROM categorias cat
     WHERE total_artistas > 0
     ORDER BY cat.nome
  `).all();
}

export function obterCategoria(id) {
  return db.prepare('SELECT id, nome, icone, cor FROM categorias WHERE id = ?').get(id);
}

export function artistasDaCategoria(categoriaId) {
  return db.prepare(`
    SELECT a.id, a.nome, a.foto,
           (SELECT COUNT(*) FROM cds c
             WHERE c.artista_id = a.id AND c.categoria_id = @categoria AND c.status = 'lancado' AND c.oculto = 0) AS total_cds
      FROM artistas a
     WHERE total_cds > 0
     ORDER BY a.nome
  `).all({ categoria: categoriaId });
}

export function obterArtista(id) {
  return db.prepare(`
    SELECT a.id, a.nome, a.foto, a.categoria_id, cat.nome AS categoria, cat.icone, cat.cor
      FROM artistas a JOIN categorias cat ON cat.id = a.categoria_id
     WHERE a.id = ?
  `).get(id);
}

export function cdsDoArtista(artistaId) {
  return db.prepare(`${CD_SELECT} WHERE c.artista_id = ? AND c.status = 'lancado' AND c.oculto = 0 ORDER BY c.ano DESC, c.titulo`)
    .all(artistaId).map(comContagem);
}

export function obterCd(id) {
  const cd = db.prepare(`${CD_SELECT} WHERE c.id = ? AND c.oculto = 0`).get(id);
  return cd ? comContagem(cd) : null;
}

export function lancamentos() {
  return db.prepare(`${CD_SELECT} WHERE c.status = 'novo' AND c.oculto = 0 ORDER BY c.data_lancamento`).all().map(comContagem);
}

export function musicasDoCd(cdId) {
  return db.prepare(`${MUSICA_SELECT} WHERE m.cd_id = ? AND m.oculta = 0 ORDER BY m.rowid`).all(cdId);
}

export function obterMusica(id) {
  return db.prepare(`${MUSICA_SELECT} WHERE m.id = ?`).get(id);
}

// Músicas que esta sessão pediu por último (sem repetir), pra pedir de novo com um toque.
export function pedidosRecentes(sessionId, limite = 6) {
  const ids = db.prepare(`
    SELECT musica_id FROM fila WHERE session_id = ? AND status <> 'erro'
     GROUP BY musica_id ORDER BY MAX(criado_em) DESC LIMIT ?
  `).all(sessionId, limite).map((linha) => linha.musica_id);
  return ids.map((id) => obterMusica(id)).filter((m) => m && !m.oculta && !m.cd_oculto);
}

export function topTocadas(limite = 5) {
  return db.prepare(`${MUSICA_SELECT} WHERE m.vezes_tocada > 0 AND ${VISIVEL} ORDER BY m.vezes_tocada DESC, m.titulo LIMIT ?`)
    .all(limite);
}

// Sorteia entre as mais tocadas; sem histórico ainda, sorteia do acervo todo.
export function sugestoes(quantidade = 4) {
  return db.prepare(`
    SELECT * FROM (${MUSICA_SELECT} WHERE ${VISIVEL} ORDER BY m.vezes_tocada DESC, RANDOM() LIMIT 20)
     ORDER BY RANDOM() LIMIT ?
  `).all(quantidade);
}

// Cada palavra da busca precisa aparecer em algum de: música, artista, CD ou categoria.
// `incluirOcultas` é só do admin (pra achar e reexibir o que ele escondeu).
export function buscar(termo, categoriaId, { incluirOcultas = false } = {}) {
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean).slice(0, 6);
  if (!palavras.length || palavras.join('').length < 2) return [];

  const parametros = palavras.map((p) => `%${p.replace(/[\\%_]/g, '\\$&')}%`);
  const condicoes = palavras.map(
    () => `norm(m.titulo || ' ' || a.nome || ' ' || c.titulo || ' ' || cat.nome) LIKE ? ESCAPE '\\'`,
  );
  if (categoriaId) {
    condicoes.push('cat.id = ?');
    parametros.push(categoriaId);
  }
  if (!incluirOcultas) condicoes.push(VISIVEL);

  return db.prepare(`${MUSICA_SELECT} WHERE ${condicoes.join(' AND ')} ORDER BY m.vezes_tocada DESC, m.titulo LIMIT 60`)
    .all(...parametros);
}
