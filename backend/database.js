import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

export const agora = () => new Date().toISOString();
export const novoId = () => crypto.randomUUID();

// Sessão interna dona das músicas da playlist automática (não é de nenhum cliente).
export const SESSAO_SISTEMA = 'sistema';

export const normalizar = (texto) =>
  String(texto ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export const slug = (texto) =>
  normalizar(texto).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// Busca sem acento/caixa: "forro" encontra "Forró".
db.function('norm', { deterministic: true }, normalizar);

// Datas são ISO 8601 em UTC (comparáveis como texto).
db.exec(`
  CREATE TABLE IF NOT EXISTS categorias (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    icone TEXT,
    cor TEXT
  );

  CREATE TABLE IF NOT EXISTS artistas (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    categoria_id TEXT NOT NULL REFERENCES categorias(id),
    foto TEXT,
    criado_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cds (
    id TEXT PRIMARY KEY,
    titulo TEXT NOT NULL,
    artista_id TEXT NOT NULL REFERENCES artistas(id),
    categoria_id TEXT NOT NULL REFERENCES categorias(id),
    capa TEXT,
    ano INTEGER,
    status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'lancado')),
    data_criacao TEXT NOT NULL,
    data_lancamento TEXT NOT NULL,
    criado_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS musicas (
    id TEXT PRIMARY KEY,
    titulo TEXT NOT NULL,
    cd_id TEXT NOT NULL REFERENCES cds(id) ON DELETE CASCADE,
    duracao INTEGER,
    creditos INTEGER NOT NULL DEFAULT 1,
    arquivo TEXT NOT NULL,
    vezes_tocada INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessoes (
    id TEXT PRIMARY KEY,
    saldo INTEGER NOT NULL DEFAULT 0,
    saldo_cortesia INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL,
    expira_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pagamentos (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessoes(id),
    valor REAL NOT NULL,
    creditos INTEGER NOT NULL,
    pix_id TEXT,
    provedor TEXT NOT NULL,
    qr_code TEXT,
    qr_imagem TEXT,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmado', 'falho')),
    criado_em TEXT NOT NULL,
    expira_em TEXT NOT NULL,
    confirmado_em TEXT
  );

  CREATE TABLE IF NOT EXISTS fila (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessoes(id),
    musica_id TEXT NOT NULL REFERENCES musicas(id) ON DELETE CASCADE,
    posicao INTEGER NOT NULL,
    creditos INTEGER NOT NULL DEFAULT 1,
    creditos_cortesia INTEGER NOT NULL DEFAULT 0,
    prioridade INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando', 'tocando', 'tocado', 'erro')),
    criado_em TEXT NOT NULL,
    iniciado_em TEXT,
    fim_previsto_em TEXT
  );

  -- musica_id vira NULL se o CD for apagado: o faturamento do histórico continua valendo.
  CREATE TABLE IF NOT EXISTS historico_reproducao (
    id TEXT PRIMARY KEY,
    musica_id TEXT REFERENCES musicas(id) ON DELETE SET NULL,
    session_id TEXT,
    creditos INTEGER NOT NULL DEFAULT 1,
    cortesia INTEGER NOT NULL DEFAULT 0,
    tocado_em TEXT NOT NULL
  );

  -- Músicas que os clientes pediram e não existem no acervo. "chave" é o texto sem acento/caixa.
  CREATE TABLE IF NOT EXISTS sugestoes_clientes (
    id TEXT PRIMARY KEY,
    texto TEXT NOT NULL,
    chave TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'atendido', 'descartado')),
    criado_em TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
  );

  -- Um voto por sessão: a contagem mostra quantas pessoas diferentes pediram.
  CREATE TABLE IF NOT EXISTS sugestoes_votos (
    sugestao_id TEXT NOT NULL REFERENCES sugestoes_clientes(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    PRIMARY KEY (sugestao_id, session_id)
  );

  CREATE TABLE IF NOT EXISTS configuracoes (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );

  -- Uma linha por dia: a chave primária é o que garante "só uma vez por dia".
  CREATE TABLE IF NOT EXISTS creditos_dono (
    dia TEXT PRIMARY KEY,
    quantidade INTEGER NOT NULL,
    session_id TEXT,
    criado_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS log_cds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cd_id TEXT,
    titulo TEXT,
    evento TEXT NOT NULL,
    detalhe TEXT,
    em TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_cds_status ON cds(status, data_lancamento);
  CREATE INDEX IF NOT EXISTS idx_cds_artista ON cds(artista_id);
  CREATE INDEX IF NOT EXISTS idx_musicas_cd ON musicas(cd_id);
  CREATE INDEX IF NOT EXISTS idx_fila_status ON fila(status, posicao);
  CREATE INDEX IF NOT EXISTS idx_pagamentos_status ON pagamentos(status);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_pagamentos_pix ON pagamentos(pix_id) WHERE pix_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_historico_data ON historico_reproducao(tocado_em);
`);

// Bancos criados por versões anteriores não têm as colunas novas.
function garantirColuna(tabela, coluna, definicao) {
  const existe = db.prepare(`PRAGMA table_info(${tabela})`).all().some((c) => c.name === coluna);
  if (!existe) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
}
garantirColuna('sessoes', 'saldo_cortesia', 'INTEGER NOT NULL DEFAULT 0');
garantirColuna('fila', 'creditos_cortesia', 'INTEGER NOT NULL DEFAULT 0');
garantirColuna('fila', 'prioridade', 'INTEGER NOT NULL DEFAULT 0');
garantirColuna('historico_reproducao', 'cortesia', 'INTEGER NOT NULL DEFAULT 0');

// Vencimento em 2999: nunca é zerada nem apagada pelas rotinas de limpeza.
db.prepare("INSERT OR IGNORE INTO sessoes (id, saldo, criado_em, expira_em) VALUES (?, 0, ?, '2999-12-31T00:00:00.000Z')")
  .run(SESSAO_SISTEMA, agora());

export function registrarLogCd(cdId, titulo, evento, detalhe = null) {
  db.prepare('INSERT INTO log_cds (cd_id, titulo, evento, detalhe, em) VALUES (?, ?, ?, ?, ?)')
    .run(cdId, titulo, evento, detalhe, agora());
}
