import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { db } from '../database.js';
import { situacaoNoteiro } from './noteiro.js';
import { topMusicasDoPeriodo } from './relatorio.js';
import { lerRelogio } from './relogio.js';

// Relatório para a central na nuvem (app do dono, do parceiro e dos pontos). Quem chama é sempre a máquina:
// ela continua sem nenhuma porta aberta para a internet. Cada relatório é uma foto completa (relógio, últimos
// dias, mais pedidas), então um envio perdido não faz falta: o próximo traz tudo de novo.
const DIAS = 40; // o app soma "hoje", "7 dias" e "mês" a partir daqui
const PRIMEIRO_ENVIO_MS = 60_000; // espera o player e a rede subirem depois de ligar
const TIMEOUT_MS = 20_000;

const versao = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(config.raiz, 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
})();

let estado = { ultimo_envio: null, ultimo_erro: null };
let relogio = null;

export const centralConfigurada = () => Boolean(config.central.url && config.central.token);
export const situacaoCentral = () => ({ configurada: centralConfigurada(), url: config.central.url || null, ...estado });

const diaLocal = (data) => data.toLocaleDateString('sv-SE');

function ultimosDias() {
  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  desde.setDate(desde.getDate() - (DIAS - 1));
  const desdeIso = desde.toISOString();
  const porDia = new Map();
  for (let i = 0; i < DIAS; i++) {
    const d = new Date(desde);
    d.setDate(desde.getDate() + i);
    porDia.set(diaLocal(d), { dia: diaLocal(d), entrou: 0, pix: 0, nota: 0, cartao: 0, tocadas: 0 });
  }
  for (const linha of db.prepare(`
    SELECT date(confirmado_em, 'localtime') AS dia, metodo, COALESCE(SUM(valor), 0) AS total
      FROM pagamentos WHERE status = 'confirmado' AND confirmado_em >= ? GROUP BY dia, metodo
  `).all(desdeIso)) {
    const d = porDia.get(linha.dia);
    if (!d || !(linha.metodo in d)) continue;
    d[linha.metodo] += linha.total;
    d.entrou += linha.total;
  }
  for (const linha of db.prepare(`
    SELECT date(tocado_em, 'localtime') AS dia, COUNT(*) AS tocadas FROM historico_reproducao WHERE tocado_em >= ? GROUP BY dia
  `).all(desdeIso)) {
    const d = porDia.get(linha.dia);
    if (d) d.tocadas = linha.tocadas;
  }
  return [...porDia.values()];
}

function discoLivrePct() {
  try {
    const { bavail, blocks } = fs.statfsSync(config.musicasDir);
    return blocks ? Math.round((bavail / blocks) * 100) : null;
  } catch {
    return null;
  }
}

export function montarRelatorio() {
  const relogioMaquina = lerRelogio();
  const noteiro = situacaoNoteiro();
  const desdeTop = relogioMaquina.parcial.desde || new Date(Date.now() - 30 * 86_400_000).toISOString();
  return {
    versao,
    enviado_em: new Date().toISOString(),
    nome_local: config.nomeLocal,
    relogio: relogioMaquina,
    dias: ultimosDias(),
    top: topMusicasDoPeriodo(desdeTop, new Date(Date.now() + 60_000).toISOString(), 10)
      .map((m) => ({ titulo: m.titulo, artista: m.artista, vezes: m.tocadas })),
    status: {
      noteiro: { ativo: noteiro.ativo, conectado: noteiro.conectado },
      disco_livre_pct: discoLivrePct(),
      modo_teste: config.pagamento.provedor === 'mock',
    },
  };
}

export async function enviarRelatorio() {
  if (!centralConfigurada()) return { enviado: false, motivo: 'sem_central' };
  try {
    const resposta = await fetch(`${config.central.url.replace(/\/+$/, '')}/api/maquina/relatorio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.central.token}` },
      body: JSON.stringify(montarRelatorio()),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resposta.ok) throw new Error(resposta.status === 401 ? 'token da máquina recusado pela central' : `central respondeu ${resposta.status}`);
    estado = { ultimo_envio: new Date().toISOString(), ultimo_erro: null };
    return { enviado: true };
  } catch (erro) {
    estado = { ...estado, ultimo_erro: { em: new Date().toISOString(), motivo: erro.message } };
    console.warn(`[central] relatório não enviado: ${erro.message}`);
    return { enviado: false, motivo: erro.message };
  }
}

// Ao ligar (depois de 1 min) e a cada CENTRAL_INTERVALO_H horas. O fechamento do caixa manda na hora.
export function iniciarCentral() {
  if (!centralConfigurada() || relogio) return;
  const intervaloMs = Math.max(1, config.central.intervaloH) * 3_600_000;
  setTimeout(() => { enviarRelatorio(); }, PRIMEIRO_ENVIO_MS).unref();
  relogio = setInterval(() => { enviarRelatorio(); }, intervaloMs);
  relogio.unref();
  console.log(`[central] relatórios para ${config.central.url} a cada ${config.central.intervaloH} h`);
}

export function encerrarCentral() {
  clearInterval(relogio);
  relogio = null;
}
