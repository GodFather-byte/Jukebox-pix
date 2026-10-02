import { agora, db, normalizar, novoId } from '../database.js';
import { ErroApi } from '../erros.js';
import { emitirSessao, emitirTodos, telasConectadas } from '../events.js';
import * as configuracoes from './configuracoes.js';
import { creditar, debitar, obterSessao, rotulo } from './sessoes.js';

// Recado pago no telão. O cliente paga com créditos; o dono aprova (se a moderação estiver ligada);
// o servidor coloca um recado por vez no ar e todos os monitores mostram o mesmo.
// O dinheiro só vira faturamento quando o recado vai ao ar. Recusado ou parado demais: devolve ao cliente.
const MAX_POR_PESSOA = 2; // recados esperando ou no ar ao mesmo tempo
const MAX_PENDENTES = 30; // fila de moderação
const ESPERA_SEM_DECISAO_MS = 30 * 60_000; // o dono não decidiu em 30 min: devolve
const ESPERA_APROVADO_MS = 60 * 60_000; // aprovado mas sem vez no telão em 1 h: devolve
const ATIVOS = "('pendente', 'aprovado', 'exibindo')";

// ---------- Texto ----------

// Tira caracteres de controle e invisíveis (dá para esconder texto neles) e junta espaços.
export function limparTexto(bruto) {
  return String(bruto ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ') // quebra de linha e tabulação viram espaço
    .replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠﻿]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };

// "P u t @" e "pvta" não passam: compara sem acento, trocando números parecidos com letras.
const paraComparar = (texto) => normalizar(texto)
  .replace(/[013457@$]/g, (c) => LEET[c])
  .replace(/[^a-z]+/g, ' ')
  .trim();

export function contemPalavraProibida(texto) {
  const comEspacos = ` ${paraComparar(texto)} `;
  const colado = comEspacos.replace(/ /g, '');
  return configuracoes.palavrasBloqueadas().some((palavra) => {
    const p = paraComparar(palavra);
    if (!p) return false;
    // Palavras curtas só valem inteiras ("cu" não pode barrar "curtir"); as longas também pegam letras separadas.
    return comEspacos.includes(` ${p} `) || (p.replace(/ /g, '').length >= 5 && colado.includes(p.replace(/ /g, '')));
  });
}

// ---------- Cliente ----------

export const enviarNoBanco = db.transaction((sessionId, textoBruto) => {
  const cfg = configuracoes.lerRecados();
  if (!cfg.ativo) throw new ErroApi(403, 'Os recados no telão estão desativados.', 'RECADOS_DESATIVADOS');
  if (!sessionId || !obterSessao(sessionId)) throw new ErroApi(404, 'Sessão não encontrada');
  if (telasConectadas() === 0) throw new ErroApi(409, 'O telão está desligado agora. Tente de novo mais tarde.', 'SEM_TELAO');

  const texto = limparTexto(textoBruto);
  if (texto.length < 3) throw new ErroApi(400, 'Escreva pelo menos 3 letras no recado.');
  if (texto.length > configuracoes.RECADO_MAX_CARACTERES) {
    throw new ErroApi(400, `O recado pode ter no máximo ${configuracoes.RECADO_MAX_CARACTERES} caracteres.`);
  }
  if (contemPalavraProibida(texto)) {
    throw new ErroApi(422, 'Esse recado tem palavras que a casa não permite. Reescreva e tente de novo (nada foi cobrado).', 'RECADO_PROIBIDO');
  }

  const meus = db.prepare(`SELECT COUNT(*) AS total FROM recados WHERE session_id = ? AND status IN ${ATIVOS}`).get(sessionId).total;
  if (meus >= MAX_POR_PESSOA) throw new ErroApi(429, 'Você já tem recados esperando a vez no telão. Aguarde passarem para mandar outro.', 'LIMITE_RECADOS');
  const pendentes = db.prepare("SELECT COUNT(*) AS total FROM recados WHERE status = 'pendente'").get().total;
  if (pendentes >= MAX_PENDENTES) throw new ErroApi(429, 'Há muitos recados esperando aprovação. Tente de novo daqui a pouco.', 'RECADOS_CHEIO');

  const gasto = debitar(sessionId, cfg.preco);
  if (!gasto) throw new ErroApi(402, 'Saldo insuficiente. Adicione créditos para mandar o recado.', 'SALDO_INSUFICIENTE');

  const id = novoId();
  const status = cfg.moderacao ? 'pendente' : 'aprovado';
  const agoraIso = agora();
  db.prepare(`
    INSERT INTO recados (id, session_id, texto, creditos, creditos_cortesia, status, criado_em, decidido_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, sessionId, texto, cfg.preco, gasto.cortesia, status, agoraIso, status === 'aprovado' ? agoraIso : null);

  return { id, status, texto, saldo: obterSessao(sessionId).saldo };
});

export function enviar(sessionId, texto) {
  const recado = enviarNoBanco(sessionId, texto);
  emitirTodos('recados');
  return recado;
}

export function listarDaSessao(sessionId) {
  if (!sessionId || !obterSessao(sessionId)) throw new ErroApi(404, 'Sessão não encontrada');
  return db.prepare('SELECT id, texto, status, criado_em FROM recados WHERE session_id = ? ORDER BY criado_em DESC LIMIT 5').all(sessionId);
}

// O que o monitor mostra agora (ou nada).
export function noAr() {
  const recado = db.prepare("SELECT id, texto, exibir_ate FROM recados WHERE status = 'exibindo'").get();
  if (!recado || recado.exibir_ate <= agora()) return null;
  return { id: recado.id, texto: recado.texto, ate: recado.exibir_ate };
}

// ---------- Dono ----------

const COLUNAS = 'id, session_id, texto, creditos, creditos_cortesia, status, criado_em, decidido_em, exibido_em, exibir_ate';
const paraAdmin = (r) => ({ ...r, session_id: undefined, quem: rotulo(r.session_id) });

export function listarAdmin() {
  const por = (condicao, ordem, limite = 50) => db.prepare(`SELECT ${COLUNAS} FROM recados WHERE ${condicao} ORDER BY ${ordem} LIMIT ?`).all(limite).map(paraAdmin);
  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);
  const hoje = totaisDoPeriodo(inicioDoDia.toISOString(), new Date(Date.now() + 60_000).toISOString());

  return {
    config: configuracoes.lerRecados(),
    telas: telasConectadas(),
    telao_online: telasConectadas() > 0,
    pendentes: por("status = 'pendente'", 'criado_em'),
    aprovados: por("status = 'aprovado'", 'decidido_em, criado_em'),
    no_ar: por("status = 'exibindo'", 'exibido_em', 1)[0] ?? null,
    recentes: por("status IN ('exibido', 'recusado', 'expirado')", 'COALESCE(exibido_em, decidido_em, criado_em) DESC', 15),
    hoje,
  };
}

// Devolve ao cliente exatamente de onde saiu o dinheiro (pago ou cortesia).
const devolver = (recado) => creditar(recado.session_id, recado.creditos - recado.creditos_cortesia, recado.creditos_cortesia);

function avisarCliente(recado, status) {
  emitirSessao(recado.session_id, 'sessao', obterSessao(recado.session_id));
  emitirSessao(recado.session_id, 'recado', { id: recado.id, status });
}

const aprovarNoBanco = db.transaction((id) => {
  const recado = db.prepare('SELECT * FROM recados WHERE id = ?').get(id);
  if (!recado) throw new ErroApi(404, 'Recado não encontrado');
  if (recado.status !== 'pendente') throw new ErroApi(409, 'Esse recado já foi decidido.');
  db.prepare("UPDATE recados SET status = 'aprovado', decidido_em = ? WHERE id = ?").run(agora(), id);
  return recado;
});

const recusarNoBanco = db.transaction((id, novoStatus = 'recusado') => {
  const recado = db.prepare('SELECT * FROM recados WHERE id = ?').get(id);
  if (!recado) throw new ErroApi(404, 'Recado não encontrado');
  if (!['pendente', 'aprovado', 'exibindo'].includes(recado.status)) throw new ErroApi(409, 'Esse recado já terminou.');
  db.prepare('UPDATE recados SET status = ?, decidido_em = ? WHERE id = ?').run(novoStatus, agora(), id);
  devolver(recado);
  return recado;
});

export function aprovar(id) {
  const recado = aprovarNoBanco(id);
  avisarCliente(recado, 'aprovado');
  emitirTodos('recados');
  tick(); // se o telão está livre, já entra no ar
  return recado;
}

// Vale para pendente, aprovado e também para o que está no ar (tirar do telão na hora). Sempre reembolsa.
export function recusar(id) {
  const recado = recusarNoBanco(id);
  if (recado.status === 'exibindo') emitirTodos('recado', { atual: null });
  avisarCliente(recado, 'recusado');
  emitirTodos('recados');
  return recado;
}

// ---------- Relógio do telão ----------

function expirarParados() {
  const limitePendente = new Date(Date.now() - ESPERA_SEM_DECISAO_MS).toISOString();
  const limiteAprovado = new Date(Date.now() - ESPERA_APROVADO_MS).toISOString();
  const parados = db.prepare(`
    SELECT id FROM recados
     WHERE (status = 'pendente' AND criado_em < ?) OR (status = 'aprovado' AND COALESCE(decidido_em, criado_em) < ?)
  `).all(limitePendente, limiteAprovado);

  for (const { id } of parados) {
    try {
      const recado = recusarNoBanco(id, 'expirado');
      avisarCliente(recado, 'expirado');
      emitirTodos('recados');
    } catch (erro) {
      if (!(erro instanceof ErroApi)) throw erro;
    }
  }
}

// Roda a cada segundo: encerra o que passou do tempo, devolve o que ficou parado e põe o próximo no ar.
export function tick() {
  const noArAgora = db.prepare("SELECT id, exibir_ate FROM recados WHERE status = 'exibindo'").get();
  if (noArAgora && (!noArAgora.exibir_ate || noArAgora.exibir_ate <= agora())) {
    db.prepare("UPDATE recados SET status = 'exibido' WHERE id = ?").run(noArAgora.id);
    emitirTodos('recado', { atual: null });
    emitirTodos('recados');
  }

  expirarParados();

  if (db.prepare("SELECT 1 FROM recados WHERE status = 'exibindo'").get() || telasConectadas() === 0) return;
  const proximo = db.prepare("SELECT * FROM recados WHERE status = 'aprovado' ORDER BY decidido_em, criado_em LIMIT 1").get();
  if (!proximo) return;

  const ate = new Date(Date.now() + configuracoes.lerRecados().segundos * 1000).toISOString();
  db.prepare("UPDATE recados SET status = 'exibindo', exibido_em = ?, exibir_ate = ? WHERE id = ?").run(agora(), ate, proximo.id);
  emitirTodos('recado', { atual: { id: proximo.id, texto: proximo.texto, ate } });
  avisarCliente(proximo, 'exibindo');
  emitirTodos('recados');
}

// Se o servidor caiu com um recado no ar, ele já foi visto: fecha como exibido (não devolve nem repete).
export function iniciarRecados() {
  db.prepare("UPDATE recados SET status = 'exibido' WHERE status = 'exibindo'").run();
  setInterval(() => {
    try {
      tick();
    } catch (erro) {
      console.error('[recados]', erro.message);
    }
  }, 1000).unref?.();
}

// ---------- Faturamento ----------

// Só conta recado que foi ao ar (exibindo/exibido). `bruto` é a parte paga, base da divisão com a boate.
export function totaisDoPeriodo(desdeIso, ateIso) {
  return db.prepare(`
    SELECT COUNT(*) AS exibidos,
           COALESCE(SUM(creditos - creditos_cortesia), 0) AS bruto,
           COALESCE(SUM(creditos_cortesia), 0) AS cortesia
      FROM recados
     WHERE status IN ('exibindo', 'exibido') AND exibido_em >= ? AND exibido_em < ?
  `).get(desdeIso, ateIso);
}

export function totaisPorDia(desdeIso, ateIso) {
  return db.prepare(`
    SELECT date(exibido_em, 'localtime') AS dia, COUNT(*) AS exibidos,
           COALESCE(SUM(creditos - creditos_cortesia), 0) AS bruto,
           COALESCE(SUM(creditos_cortesia), 0) AS cortesia
      FROM recados
     WHERE status IN ('exibindo', 'exibido') AND exibido_em >= ? AND exibido_em < ?
     GROUP BY dia
  `).all(desdeIso, ateIso);
}
