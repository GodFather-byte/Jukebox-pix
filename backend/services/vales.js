import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { agora, db, novoId } from '../database.js';
import { ErroApi } from '../erros.js';
import { urlDoApp } from '../rede.js';
import { creditar, obterSessao } from './sessoes.js';

// Vale-música: cartão com código (e QR) que o garçom entrega. Resgatar vira crédito de cortesia na sessão
// de quem resgatou: custo do dono, fora do faturamento e da divisão com a boate. Cada código vale uma vez.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem I, L, O, 0 e 1: não confunde na hora de digitar
const TAMANHO_CODIGO = 8;
const MAX_POR_LOTE = 200;
const MAX_ERROS = 6; // erros de código por pessoa (e 25 por aparelho) a cada 10 min
const JANELA_ERROS_MS = 10 * 60_000;

export const novoCodigo = () => Array.from({ length: TAMANHO_CODIGO }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join('');
export const normalizarCodigo = (texto) => String(texto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const formatarCodigo = (codigo) => `${codigo.slice(0, 4)}-${codigo.slice(4)}`;

function inteiroEntre(valor, minimo, maximo, nome) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < minimo || n > maximo) throw new ErroApi(400, `${nome}: informe um número inteiro de ${minimo} a ${maximo}.`);
  return n;
}

// ---------- Dono ----------

// Cria um lote de códigos novos. O vale vale até o fim do dia da validade (relógio do notebook).
export const gerarLote = db.transaction(({ quantidade, creditos, validade_dias: validadeDias, observacao }) => {
  const total = inteiroEntre(quantidade, 1, MAX_POR_LOTE, 'Quantidade de vales');
  const valor = inteiroEntre(creditos, 1, 20, 'Créditos por vale');
  const dias = inteiroEntre(validadeDias ?? 30, 1, 365, 'Validade em dias');
  const nota = String(observacao ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || null;

  const fim = new Date();
  fim.setHours(23, 59, 59, 999);
  fim.setDate(fim.getDate() + dias - 1);
  const validade = fim.toISOString();

  const lote = novoId().slice(0, 8);
  const criadoEm = agora();
  const inserir = db.prepare('INSERT OR IGNORE INTO vales (codigo, creditos, lote, observacao, validade_em, criado_em) VALUES (?, ?, ?, ?, ?, ?)');
  const codigos = [];
  while (codigos.length < total) {
    const codigo = novoCodigo();
    if (inserir.run(codigo, valor, lote, nota, validade, criadoEm).changes === 1) codigos.push(codigo); // colisão: sorteia outro
  }
  return { lote, creditos: valor, validade_em: validade, observacao: nota, codigos };
});

export function listarLotes() {
  return db.prepare(`
    SELECT lote, MAX(observacao) AS observacao, MAX(creditos) AS creditos, MIN(criado_em) AS criado_em, MAX(validade_em) AS validade_em,
           COUNT(*) AS total,
           COALESCE(SUM(resgatado_em IS NOT NULL), 0) AS resgatados,
           COALESCE(SUM(resgatado_em IS NULL AND validade_em < @agora), 0) AS vencidos
      FROM vales GROUP BY lote ORDER BY MIN(criado_em) DESC LIMIT 50
  `).all({ agora: agora() }).map((l) => ({ ...l, disponiveis: l.total - l.resgatados - l.vencidos }));
}

export function codigosDoLote(lote) {
  const vales = db.prepare('SELECT codigo, creditos, validade_em, resgatado_em FROM vales WHERE lote = ? ORDER BY codigo').all(String(lote));
  if (!vales.length) throw new ErroApi(404, 'Lote não encontrado');
  return vales.map((v) => ({ ...v, codigo_formatado: formatarCodigo(v.codigo) }));
}

// QR de cada vale ainda utilizável: o celular abre o app e resgata sozinho.
export async function qrsDoLote(lote) {
  const url = urlDoApp();
  const disponiveis = codigosDoLote(lote).filter((v) => !v.resgatado_em && v.validade_em >= agora());
  return Promise.all(disponiveis.map(async (v) => ({
    codigo: v.codigo_formatado,
    creditos: v.creditos,
    validade_em: v.validade_em,
    qr: await QRCode.toDataURL(`${url}/vale/${v.codigo}`, { margin: 1, width: 240, errorCorrectionLevel: 'M' }),
  })));
}

// Cancela os vales do lote que ainda não foram usados (os já resgatados ficam no histórico).
export function revogarLote(lote) {
  const resultado = db.prepare('DELETE FROM vales WHERE lote = ? AND resgatado_em IS NULL').run(String(lote));
  return resultado.changes;
}

// Para o relatório: quanto o dono "gastou" de cortesia com vales no período.
export function totaisDoPeriodo(desdeIso, ateIso) {
  return db.prepare(`
    SELECT COUNT(*) AS resgatados, COALESCE(SUM(creditos), 0) AS creditos
      FROM vales WHERE resgatado_em >= ? AND resgatado_em < ?
  `).get(desdeIso, ateIso);
}

export function totaisPorDia(desdeIso, ateIso) {
  return db.prepare(`
    SELECT date(resgatado_em, 'localtime') AS dia, COUNT(*) AS resgatados, COALESCE(SUM(creditos), 0) AS creditos
      FROM vales WHERE resgatado_em >= ? AND resgatado_em < ? GROUP BY dia
  `).all(desdeIso, ateIso);
}

// ---------- Cliente ----------

// Segura quem fica chutando códigos (memória; zera ao reiniciar).
const erros = new Map();

function contarErro(chave) {
  const agoraMs = Date.now();
  const atual = erros.get(chave);
  if (!atual || atual.libera < agoraMs) {
    erros.set(chave, { total: 1, libera: agoraMs + JANELA_ERROS_MS });
  } else {
    atual.total += 1;
  }
}

const bloqueado = (chave, limite) => {
  const atual = erros.get(chave);
  return Boolean(atual && atual.libera >= Date.now() && atual.total >= limite);
};

export function resgatar(sessionId, codigoBruto, { ip = null } = {}) {
  if (bloqueado(`sessao:${sessionId}`, MAX_ERROS) || (ip && bloqueado(`ip:${ip}`, MAX_ERROS * 4))) {
    throw new ErroApi(429, 'Muitas tentativas com código errado. Aguarde alguns minutos.', 'VALE_TENTATIVAS');
  }
  if (!sessionId || !obterSessao(sessionId)) throw new ErroApi(404, 'Sessão não encontrada');

  const codigo = normalizarCodigo(codigoBruto);
  const creditos = db.transaction(() => {
    const agoraIso = agora();
    // O UPDATE condicional é o que garante "uma vez só", mesmo com dois celulares tentando juntos.
    const resultado = db.prepare('UPDATE vales SET resgatado_em = ?, resgatado_por = ? WHERE codigo = ? AND resgatado_em IS NULL AND validade_em >= ?')
      .run(agoraIso, sessionId, codigo, agoraIso);
    if (resultado.changes !== 1) return null;
    const { creditos: valor } = db.prepare('SELECT creditos FROM vales WHERE codigo = ?').get(codigo);
    creditar(sessionId, 0, valor); // cortesia: custo do dono, fora da divisão com a boate
    return valor;
  })();

  if (creditos === null) {
    contarErro(`sessao:${sessionId}`);
    if (ip) contarErro(`ip:${ip}`);
    throw new ErroApi(404, 'Vale inválido, vencido ou já usado.', 'VALE_INVALIDO');
  }
  return { creditos, saldo: obterSessao(sessionId).saldo };
}
