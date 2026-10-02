import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { db } from '../database.js';

const PADRAO_NOME = /^jukebox-\d{4}-\d{2}-\d{2}_\d{6}\.db$/;

const doisDigitos = (n) => String(n).padStart(2, '0');

// Data/hora local no nome do arquivo: "jukebox-2026-10-02_040000.db".
function carimbo(data = new Date()) {
  const dia = `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
  return `${dia}_${doisDigitos(data.getHours())}${doisDigitos(data.getMinutes())}${doisDigitos(data.getSeconds())}`;
}

function descrever(nome) {
  const estatisticas = fs.statSync(path.join(config.backupDir, nome));
  return { arquivo: nome, bytes: estatisticas.size, criado_em: estatisticas.mtime.toISOString() };
}

export function listarBackups() {
  if (!fs.existsSync(config.backupDir)) return [];
  return fs.readdirSync(config.backupDir)
    .filter((nome) => PADRAO_NOME.test(nome))
    .sort()
    .reverse()
    .map(descrever);
}

// Mantém só os mais recentes (os nomes ordenam por data).
function podarAntigos() {
  for (const { arquivo } of listarBackups().slice(Math.max(1, config.backupManter))) {
    fs.rmSync(path.join(config.backupDir, arquivo), { force: true });
  }
}

// VACUUM INTO gera uma cópia consistente com o servidor funcionando (não basta copiar o arquivo .db: o WAL fica de fora).
export function fazerBackup() {
  fs.mkdirSync(config.backupDir, { recursive: true });
  let nome = `jukebox-${carimbo()}.db`;
  if (fs.existsSync(path.join(config.backupDir, nome))) nome = `jukebox-${carimbo(new Date(Date.now() + 1000))}.db`;

  db.prepare('VACUUM INTO ?').run(path.join(config.backupDir, nome));
  podarAntigos();
  return descrever(nome);
}

export function garantirBackupDoDia() {
  const hoje = `jukebox-${carimbo().slice(0, 10)}`;
  if (listarBackups().some((b) => b.arquivo.startsWith(hoje))) return null;
  return fazerBackup();
}

// Só devolve caminho de arquivo que a gente mesmo criou: o nome vem da URL.
export function caminhoDoBackup(nome) {
  if (!PADRAO_NOME.test(String(nome))) return null;
  const caminho = path.join(config.backupDir, nome);
  return fs.existsSync(caminho) ? caminho : null;
}
