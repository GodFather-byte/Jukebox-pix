import { config } from '../config.js';
import { db } from '../database.js';
import { ErroApi } from '../erros.js';
import * as recados from './recados.js';
import * as vales from './vales.js';

const DIA_MS = 24 * 60 * 60_000;
const MAX_DIAS = 366;
const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/;

const chaveDia = (data) => data.toLocaleDateString('sv-SE');
const inicioDoDia = (texto) => new Date(`${texto}T00:00:00`); // sem "Z": meia-noite no relógio do notebook

function intervalo(de, ate) {
  if (!FORMATO_DIA.test(de ?? '') || !FORMATO_DIA.test(ate ?? '')) throw new ErroApi(400, 'Informe as datas no formato AAAA-MM-DD.');
  const inicio = inicioDoDia(de);
  const fimInclusivo = inicioDoDia(ate);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fimInclusivo.getTime())) throw new ErroApi(400, 'Data inválida.');
  if (fimInclusivo < inicio) throw new ErroApi(400, 'A data final não pode ser antes da inicial.');
  const dias = Math.round((fimInclusivo - inicio) / DIA_MS) + 1;
  if (dias > MAX_DIAS) throw new ErroApi(400, `Escolha um período de até ${MAX_DIAS} dias.`);

  const fimExclusivo = new Date(fimInclusivo);
  fimExclusivo.setDate(fimExclusivo.getDate() + 1);
  return { inicio, fimExclusivo, dias };
}

/**
 * Totais de um intervalo de instantes (ISO). Mesma regra do fechamento: "bruto" é só a parte paga das músicas
 * tocadas e dos recados que foram ao ar, que é a base da divisão com a boate.
 */
export function resumoPeriodo(desdeIso, ateIso) {
  const musicas = db.prepare(`
    SELECT COUNT(*) AS tocadas, COALESCE(SUM(creditos), 0) AS bruto, COALESCE(SUM(cortesia), 0) AS cortesia
      FROM historico_reproducao WHERE tocado_em >= ? AND tocado_em < ?
  `).get(desdeIso, ateIso);
  const recadosNoAr = recados.totaisDoPeriodo(desdeIso, ateIso);
  const pix = db.prepare(`
    SELECT COUNT(*) AS pagamentos, COALESCE(SUM(valor), 0) AS arrecadado
      FROM pagamentos WHERE status = 'confirmado' AND confirmado_em >= ? AND confirmado_em < ?
  `).get(desdeIso, ateIso);
  const valesUsados = vales.totaisDoPeriodo(desdeIso, ateIso);
  const porMetodo = { pix: 0, cartao: 0, nota: 0 };
  for (const { metodo, total } of db.prepare(`
    SELECT metodo, COALESCE(SUM(valor), 0) AS total
      FROM pagamentos WHERE status = 'confirmado' AND confirmado_em >= ? AND confirmado_em < ? GROUP BY metodo
  `).all(desdeIso, ateIso)) porMetodo[metodo] = total;

  const bruto = musicas.bruto + recadosNoAr.bruto;
  const usuario = (bruto * config.divisaoUsuario) / 100;
  return {
    tocadas: musicas.tocadas,
    cortesia: musicas.cortesia,
    recados: recadosNoAr.exibidos,
    bruto,
    usuario,
    boate: bruto - usuario,
    pagamentos: pix.pagamentos,
    arrecadado: pix.arrecadado,
    por_metodo: porMetodo,
    ticket_medio: pix.pagamentos ? pix.arrecadado / pix.pagamentos : 0,
    vales: valesUsados.resgatados,
    vales_creditos: valesUsados.creditos,
  };
}

export function topMusicasDoPeriodo(desdeIso, ateIso, limite = 3) {
  return db.prepare(`
    SELECT m.titulo, a.nome AS artista, COUNT(*) AS tocadas
      FROM historico_reproducao h
      JOIN musicas m ON m.id = h.musica_id JOIN cds c ON c.id = m.cd_id JOIN artistas a ON a.id = c.artista_id
     WHERE h.tocado_em >= ? AND h.tocado_em < ?
     GROUP BY m.id ORDER BY tocadas DESC, m.titulo LIMIT ?
  `).all(desdeIso, ateIso, limite);
}

/**
 * Fechamento de um período (datas locais, inclusive). "Faturado" é só a parte paga das músicas
 * tocadas e dos recados exibidos, que é a base da divisão com a boate; cortesia, vales e playlist
 * automática ficam de fora.
 */
export function gerar(de, ate) {
  const { inicio, fimExclusivo, dias } = intervalo(de, ate);
  const desde = inicio.toISOString();
  const ateIso = fimExclusivo.toISOString();

  const tocadasPorDia = new Map(db.prepare(`
    SELECT date(tocado_em, 'localtime') AS dia, COUNT(*) AS tocadas,
           COALESCE(SUM(creditos), 0) AS bruto, COALESCE(SUM(cortesia), 0) AS cortesia
      FROM historico_reproducao WHERE tocado_em >= ? AND tocado_em < ? GROUP BY dia
  `).all(desde, ateIso).map((linha) => [linha.dia, linha]));

  const pagamentosPorDia = new Map(db.prepare(`
    SELECT date(confirmado_em, 'localtime') AS dia, COUNT(*) AS pagamentos, COALESCE(SUM(valor), 0) AS arrecadado
      FROM pagamentos WHERE status = 'confirmado' AND confirmado_em >= ? AND confirmado_em < ? GROUP BY dia
  `).all(desde, ateIso).map((linha) => [linha.dia, linha]));

  const recadosPorDia = new Map(recados.totaisPorDia(desde, ateIso).map((linha) => [linha.dia, linha]));
  const valesPorDia = new Map(vales.totaisPorDia(desde, ateIso).map((linha) => [linha.dia, linha]));

  const parteUsuario = (bruto) => (bruto * config.divisaoUsuario) / 100;
  const porDia = [];
  const dia = new Date(inicio);
  for (let i = 0; i < dias; i++) {
    const chave = chaveDia(dia);
    const t = tocadasPorDia.get(chave);
    const p = pagamentosPorDia.get(chave);
    const r = recadosPorDia.get(chave);
    const v = valesPorDia.get(chave);
    const bruto = (t?.bruto ?? 0) + (r?.bruto ?? 0);
    porDia.push({
      dia: chave,
      tocadas: t?.tocadas ?? 0,
      cortesia: t?.cortesia ?? 0,
      recados: r?.exibidos ?? 0,
      bruto,
      usuario: parteUsuario(bruto),
      boate: bruto - parteUsuario(bruto),
      pagamentos: p?.pagamentos ?? 0,
      arrecadado: p?.arrecadado ?? 0,
      vales: v?.resgatados ?? 0,
      vales_creditos: v?.creditos ?? 0,
    });
    dia.setDate(dia.getDate() + 1);
  }

  const soma = (campo) => porDia.reduce((total, linha) => total + linha[campo], 0);
  const totais = {
    tocadas: soma('tocadas'),
    cortesia: soma('cortesia'),
    recados: soma('recados'),
    bruto: soma('bruto'),
    usuario: soma('usuario'),
    boate: soma('boate'),
    pagamentos: soma('pagamentos'),
    arrecadado: soma('arrecadado'),
    vales: soma('vales'),
    vales_creditos: soma('vales_creditos'),
  };
  totais.ticket_medio = totais.pagamentos ? totais.arrecadado / totais.pagamentos : 0;

  const horas = new Map(db.prepare(`
    SELECT CAST(strftime('%H', tocado_em, 'localtime') AS INTEGER) AS hora, COUNT(*) AS tocadas
      FROM historico_reproducao WHERE tocado_em >= ? AND tocado_em < ? GROUP BY hora
  `).all(desde, ateIso).map((linha) => [linha.hora, linha.tocadas]));
  const porHora = Array.from({ length: 24 }, (_, hora) => ({ hora, tocadas: horas.get(hora) ?? 0 }));

  const topMusicas = db.prepare(`
    SELECT m.titulo, a.nome AS artista, COUNT(*) AS tocadas
      FROM historico_reproducao h
      JOIN musicas m ON m.id = h.musica_id JOIN cds c ON c.id = m.cd_id JOIN artistas a ON a.id = c.artista_id
     WHERE h.tocado_em >= ? AND h.tocado_em < ?
     GROUP BY m.id ORDER BY tocadas DESC, m.titulo LIMIT 10
  `).all(desde, ateIso);

  const topArtistas = db.prepare(`
    SELECT a.nome, COUNT(*) AS tocadas
      FROM historico_reproducao h
      JOIN musicas m ON m.id = h.musica_id JOIN cds c ON c.id = m.cd_id JOIN artistas a ON a.id = c.artista_id
     WHERE h.tocado_em >= ? AND h.tocado_em < ?
     GROUP BY a.id ORDER BY tocadas DESC, a.nome LIMIT 10
  `).all(desde, ateIso);

  // CDs já no ar (e antigos o bastante) em que nenhuma música tocou no período: candidatos a trocar por outro.
  const parados = db.prepare(`
    SELECT c.titulo, a.nome AS artista, cat.nome AS categoria, c.criado_em,
           (SELECT COUNT(*) FROM historico_reproducao h JOIN musicas m ON m.id = h.musica_id
             WHERE m.cd_id = c.id AND h.tocado_em >= @desde AND h.tocado_em < @ate) AS tocadas
      FROM cds c JOIN artistas a ON a.id = c.artista_id JOIN categorias cat ON cat.id = c.categoria_id
     WHERE c.status = 'lancado' AND c.oculto = 0 AND c.criado_em < @desde AND tocadas = 0
     ORDER BY c.criado_em
  `).all({ desde, ate: ateIso });

  const pico = porHora.reduce((melhor, h) => (h.tocadas > melhor.tocadas ? h : melhor), porHora[0]);

  return {
    de, ate, dias,
    divisao_usuario: config.divisaoUsuario,
    totais,
    por_dia: porDia,
    por_hora: porHora,
    horario_de_pico: pico.tocadas > 0 ? pico.hora : null,
    top_musicas: topMusicas,
    top_artistas: topArtistas,
    acervo_parado: { total: parados.length, cds: parados.slice(0, 15) },
  };
}

// CSV para Excel brasileiro: separador ";", vírgula decimal e BOM para acentos.
export function paraCsv(relatorio) {
  const reais = (n) => n.toFixed(2).replace('.', ',');
  const data = (iso) => iso.split('-').reverse().join('/');
  const linhas = [
    ['Dia', 'Músicas tocadas', 'De cortesia', 'Recados no telão', 'Faturado (R$)', 'Sua parte (R$)', 'Parte da boate (R$)', 'Pix recebido (R$)', 'Pagamentos', 'Vales resgatados'],
    ...relatorio.por_dia.map((d) => [data(d.dia), d.tocadas, d.cortesia, d.recados, reais(d.bruto), reais(d.usuario), reais(d.boate), reais(d.arrecadado), d.pagamentos, d.vales]),
    ['TOTAL', relatorio.totais.tocadas, relatorio.totais.cortesia, relatorio.totais.recados, reais(relatorio.totais.bruto), reais(relatorio.totais.usuario), reais(relatorio.totais.boate), reais(relatorio.totais.arrecadado), relatorio.totais.pagamentos, relatorio.totais.vales],
  ];
  return `﻿${linhas.map((linha) => linha.join(';')).join('\r\n')}\r\n`;
}
