import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { agora, db, novoId } from '../database.js';
import { ErroApi } from '../erros.js';
import * as configuracoes from './configuracoes.js';
import { apagarArquivo, EXT_IMAGEM, moverArquivo } from './biblioteca.js';

// Cartazes (patrocinadores, promoções) giram em tela cheia no monitor. A imagem é pública (o monitor precisa
// dela); só o que está nesta pasta é servido.
fs.mkdirSync(config.cartazesDir, { recursive: true });

export const cartazesDir = config.cartazesDir;

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const hojeLocal = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD no relógio do notebook
const ultimaContagem = new Map(); // id -> instante da última exibição contada

const obterLinha = (id) => db.prepare('SELECT * FROM cartazes WHERE id = ?').get(id);

// Confere os primeiros bytes: o arquivo precisa ser mesmo uma imagem, não só ter o nome de uma.
function ehImagem(caminho) {
  const bytes = Buffer.alloc(12);
  const arquivo = fs.openSync(caminho, 'r');
  try { fs.readSync(arquivo, bytes, 0, 12, 0); } finally { fs.closeSync(arquivo); }
  const jpeg = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
  const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
  const webp = bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP';
  return jpeg || png || webp;
}

function validarData(valor, nome) {
  if (valor === undefined || valor === null || valor === '') return null;
  if (!FORMATO_DATA.test(String(valor)) || Number.isNaN(new Date(`${valor}T00:00:00`).getTime())) {
    throw new ErroApi(400, `${nome}: use o formato AAAA-MM-DD.`);
  }
  return String(valor);
}

function validarSegundos(valor) {
  if (valor === undefined || valor === null || valor === '') return 10;
  const segundos = Number(valor);
  if (!Number.isInteger(segundos) || segundos < 5 || segundos > 60) throw new ErroApi(400, 'Tempo na tela: de 5 a 60 segundos.');
  return segundos;
}

const textoCurto = (valor, limite) => String(valor ?? '').replace(/\s+/g, ' ').trim().slice(0, limite);

function validarPeriodo(inicio, fim) {
  if (inicio && fim && fim < inicio) throw new ErroApi(400, 'A data final não pode ser antes da inicial.');
}

const vigente = (c, hoje) => Boolean(c.ativo) && (!c.inicio_em || c.inicio_em <= hoje) && (!c.fim_em || c.fim_em >= hoje);

export function listar() {
  const hoje = hojeLocal();
  return db.prepare('SELECT * FROM cartazes ORDER BY criado_em').all().map((c) => ({
    ...c,
    url: `/cartazes/${c.imagem}`,
    no_ar: vigente(c, hoje),
  }));
}

// O que o monitor recebe: só os cartazes que valem hoje, e nada se o recurso estiver desligado.
export function publico() {
  const { ativo, intervalo } = configuracoes.lerCartazes();
  const hoje = hojeLocal();
  const cartazes = !ativo ? [] : db.prepare('SELECT * FROM cartazes ORDER BY criado_em').all()
    .filter((c) => vigente(c, hoje))
    .map((c) => ({ id: c.id, imagem: `/cartazes/${c.imagem}`, legenda: c.legenda, segundos: c.segundos }));
  return { ativo, intervalo, cartazes };
}

export function criar({ titulo, legenda, segundos, inicio_em: inicio, fim_em: fim, arquivoTemporario, nomeOriginal }) {
  const tituloLimpo = textoCurto(titulo, 80);
  if (!tituloLimpo) throw new ErroApi(400, 'Dê um nome para o cartaz (só você vê).');
  const extensao = path.extname(nomeOriginal ?? '').toLowerCase();
  if (!EXT_IMAGEM.has(extensao) || !ehImagem(arquivoTemporario)) throw new ErroApi(400, 'Envie uma imagem JPG, PNG ou WebP.');

  const inicioFinal = validarData(inicio, 'Data inicial');
  const fimFinal = validarData(fim, 'Data final');
  validarPeriodo(inicioFinal, fimFinal);

  const id = novoId();
  const nome = `${id}${extensao}`;
  moverArquivo(arquivoTemporario, path.join(config.cartazesDir, nome));
  db.prepare(`
    INSERT INTO cartazes (id, titulo, imagem, legenda, segundos, ativo, inicio_em, fim_em, criado_em)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(id, tituloLimpo, nome, textoCurto(legenda, 120) || null, validarSegundos(segundos), inicioFinal, fimFinal, agora());
  return obterLinha(id);
}

export function atualizar(id, entrada = {}) {
  const atual = obterLinha(id);
  if (!atual) throw new ErroApi(404, 'Cartaz não encontrado');

  const titulo = entrada.titulo !== undefined ? textoCurto(entrada.titulo, 80) : atual.titulo;
  if (!titulo) throw new ErroApi(400, 'Dê um nome para o cartaz.');
  const legenda = entrada.legenda !== undefined ? textoCurto(entrada.legenda, 120) || null : atual.legenda;
  const segundos = entrada.segundos !== undefined ? validarSegundos(entrada.segundos) : atual.segundos;
  const inicio = entrada.inicio_em !== undefined ? validarData(entrada.inicio_em, 'Data inicial') : atual.inicio_em;
  const fim = entrada.fim_em !== undefined ? validarData(entrada.fim_em, 'Data final') : atual.fim_em;
  validarPeriodo(inicio, fim);
  const ativo = entrada.ativo !== undefined ? (entrada.ativo ? 1 : 0) : atual.ativo;

  db.prepare('UPDATE cartazes SET titulo = ?, legenda = ?, segundos = ?, inicio_em = ?, fim_em = ?, ativo = ? WHERE id = ?')
    .run(titulo, legenda, segundos, inicio, fim, ativo, id);
  return obterLinha(id);
}

export function remover(id) {
  const cartaz = obterLinha(id);
  if (!cartaz) throw new ErroApi(404, 'Cartaz não encontrado');
  db.prepare('DELETE FROM cartazes WHERE id = ?').run(id);
  const caminho = path.resolve(config.cartazesDir, cartaz.imagem);
  if (caminho.startsWith(config.cartazesDir + path.sep)) apagarArquivo(caminho);
}

// O monitor avisa cada vez que mostra um cartaz: serve de prova para quem paga o espaço.
// Ignora repetição em menos de 3 s (aba recarregando, dois monitores no mesmo instante contam como um).
export function registrarExibicao(id) {
  const agoraMs = Date.now();
  if (agoraMs - (ultimaContagem.get(id) ?? 0) < 3000) return false;
  const resultado = db.prepare('UPDATE cartazes SET exibicoes = exibicoes + 1 WHERE id = ?').run(id);
  if (resultado.changes) ultimaContagem.set(id, agoraMs);
  return resultado.changes > 0;
}
