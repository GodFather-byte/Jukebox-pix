import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

// Banco da central. Uma linha por máquina (com o último relatório, para o painel abrir rápido) e o histórico de
// relatórios, para os gráficos e para conferir fechamentos antigos.
const arquivo = process.env.CENTRAL_DB || path.resolve('dados', 'central.db');
fs.mkdirSync(path.dirname(arquivo), { recursive: true });

export const db = new Database(arquivo);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    login TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    papel TEXT NOT NULL CHECK (papel IN ('dono', 'parceiro', 'ponto')),
    criado_em TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS maquinas (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    local TEXT NOT NULL DEFAULT '',
    parceiro_id TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
    ponto_id TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
    token_hash TEXT NOT NULL UNIQUE,
    criado_em TEXT NOT NULL,
    ultimo_em TEXT,
    ultimo TEXT
  );
  CREATE TABLE IF NOT EXISTS relatorios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    maquina_id TEXT NOT NULL REFERENCES maquinas(id) ON DELETE CASCADE,
    recebido_em TEXT NOT NULL,
    dados TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_relatorios_maquina ON relatorios(maquina_id, recebido_em);
`);

export const agora = () => new Date().toISOString();
export const novoId = () => crypto.randomUUID();
export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
