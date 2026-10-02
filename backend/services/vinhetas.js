import fs from 'node:fs';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import { config } from '../config.js';
import { agora, db, novoId } from '../database.js';
import { ErroApi } from '../erros.js';
import { apagarArquivo, EXT_AUDIO, moverArquivo } from './biblioteca.js';

// Vinhetas são áudios curtos do dono ("Peça a sua música pelo QR Code!") que o player toca de tempos em tempos.
// Ficam fora do acervo: não custam crédito, não entram no ranking nem no faturamento.
fs.mkdirSync(config.vinhetasDir, { recursive: true });

const DURACAO_MAX_SEGUNDOS = 120;
let vez = 0;

const obterLinha = (id) => db.prepare('SELECT * FROM vinhetas WHERE id = ?').get(id);

export const listar = () => db.prepare('SELECT * FROM vinhetas ORDER BY criado_em').all();

// Devolve o caminho no disco, só se o arquivo estiver dentro da pasta das vinhetas.
export function caminhoAbsoluto(vinheta) {
  const caminho = path.resolve(config.vinhetasDir, vinheta.arquivo);
  return caminho.startsWith(config.vinhetasDir + path.sep) && fs.existsSync(caminho) ? caminho : null;
}

export const haAtivas = () => Boolean(db.prepare('SELECT 1 FROM vinhetas WHERE ativa = 1 LIMIT 1').get());

// Reveza entre as ativas (e ignora as que perderam o arquivo).
export function proxima() {
  const ativas = db.prepare('SELECT * FROM vinhetas WHERE ativa = 1 ORDER BY criado_em').all().filter((v) => caminhoAbsoluto(v));
  if (!ativas.length) return null;
  const escolhida = ativas[vez % ativas.length];
  vez += 1;
  return escolhida;
}

export async function criar({ titulo, arquivoTemporario, nomeOriginal }) {
  const tituloLimpo = String(titulo ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!tituloLimpo) throw new ErroApi(400, 'Dê um nome para a vinheta.');
  const extensao = path.extname(nomeOriginal ?? '').toLowerCase();
  if (!EXT_AUDIO.has(extensao)) throw new ErroApi(400, 'Envie um áudio MP3, M4A, WAV, FLAC ou OGG.');

  let duracao;
  try {
    const { format } = await parseFile(arquivoTemporario, { duration: true });
    duracao = Math.round(format.duration || 0) || null;
  } catch {
    duracao = null;
  }
  // Áudio de verdade sempre tem duração: sem ela o arquivo está corrompido (ou não é áudio).
  if (!duracao) throw new ErroApi(400, 'Não consegui ler esse arquivo de áudio. Confira se ele abre no seu computador.');
  if (duracao > DURACAO_MAX_SEGUNDOS) throw new ErroApi(400, 'A vinheta é longa demais. Use um áudio de até 2 minutos.');

  const id = novoId();
  const nome = `${id}${extensao}`;
  moverArquivo(arquivoTemporario, path.join(config.vinhetasDir, nome));
  db.prepare('INSERT INTO vinhetas (id, titulo, arquivo, duracao, ativa, criado_em) VALUES (?, ?, ?, ?, 1, ?)')
    .run(id, tituloLimpo, nome, duracao, agora());
  return obterLinha(id);
}

export function alternar(id, ativa) {
  if (!obterLinha(id)) throw new ErroApi(404, 'Vinheta não encontrada');
  db.prepare('UPDATE vinhetas SET ativa = ? WHERE id = ?').run(ativa ? 1 : 0, id);
  return obterLinha(id);
}

export function remover(id) {
  const vinheta = obterLinha(id);
  if (!vinheta) throw new ErroApi(404, 'Vinheta não encontrada');
  db.prepare('DELETE FROM vinhetas WHERE id = ?').run(id);
  const caminho = path.resolve(config.vinhetasDir, vinheta.arquivo);
  if (caminho.startsWith(config.vinhetasDir + path.sep)) apagarArquivo(caminho);
}

export function obter(id) {
  const vinheta = obterLinha(id);
  if (!vinheta) throw new ErroApi(404, 'Vinheta não encontrada');
  return vinheta;
}
