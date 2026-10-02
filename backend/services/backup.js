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

function descrever(nome, pasta) {
  const estatisticas = fs.statSync(path.join(pasta, nome));
  return { arquivo: nome, bytes: estatisticas.size, criado_em: estatisticas.mtime.toISOString() };
}

export function listarBackups(pasta = config.backupDir) {
  if (!pasta || !fs.existsSync(pasta)) return [];
  return fs.readdirSync(pasta)
    .filter((nome) => PADRAO_NOME.test(nome))
    .sort()
    .reverse()
    .map((nome) => descrever(nome, pasta));
}

// Mantém só os mais recentes (os nomes ordenam por data).
function podarAntigos(pasta) {
  for (const { arquivo } of listarBackups(pasta).slice(Math.max(1, config.backupManter))) {
    fs.rmSync(path.join(pasta, arquivo), { force: true });
  }
}

// A cópia extra é "melhor esforço": pasta desconectada (pendrive solto, nuvem offline) não derruba o backup local.
function copiarParaPastaExtra(nome) {
  if (!config.backupCopiaDir) return null;
  try {
    fs.mkdirSync(config.backupCopiaDir, { recursive: true });
    fs.copyFileSync(path.join(config.backupDir, nome), path.join(config.backupCopiaDir, nome));
    podarAntigos(config.backupCopiaDir);
    return { ok: true, pasta: config.backupCopiaDir };
  } catch (erro) {
    console.error('[backup] cópia extra falhou:', erro.message);
    return { ok: false, pasta: config.backupCopiaDir, erro: erro.message };
  }
}

// VACUUM INTO gera uma cópia consistente com o servidor funcionando (não basta copiar o arquivo .db: o WAL fica de fora).
export function fazerBackup() {
  fs.mkdirSync(config.backupDir, { recursive: true });
  let nome = `jukebox-${carimbo()}.db`;
  if (fs.existsSync(path.join(config.backupDir, nome))) nome = `jukebox-${carimbo(new Date(Date.now() + 1000))}.db`;

  db.prepare('VACUUM INTO ?').run(path.join(config.backupDir, nome));
  podarAntigos(config.backupDir);
  return { ...descrever(nome, config.backupDir), copia: copiarParaPastaExtra(nome) };
}

export function garantirBackupDoDia() {
  const hoje = `jukebox-${carimbo().slice(0, 10)}`;
  if (listarBackups().some((b) => b.arquivo.startsWith(hoje))) return null;
  return fazerBackup();
}

// Estado da cópia extra para o diagnóstico: está configurada? o último backup local já foi copiado?
export function situacaoDaCopiaExtra() {
  if (!config.backupCopiaDir) return null;
  const ultimoLocal = listarBackups()[0]?.arquivo ?? null;
  const copias = listarBackups(config.backupCopiaDir);
  return {
    pasta: config.backupCopiaDir,
    acessivel: fs.existsSync(config.backupCopiaDir),
    ultimo: copias[0] ?? null,
    em_dia: ultimoLocal ? copias.some((c) => c.arquivo === ultimoLocal) : true,
  };
}

// Só devolve caminho de arquivo que a gente mesmo criou: o nome vem da URL.
export function caminhoDoBackup(nome) {
  if (!PADRAO_NOME.test(String(nome))) return null;
  const caminho = path.join(config.backupDir, nome);
  return fs.existsSync(caminho) ? caminho : null;
}
