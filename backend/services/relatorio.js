import { config } from '../config.js';
import { db } from '../database.js';
import { ErroApi } from '../erros.js';

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
 * Fechamento de um período (datas locais, inclusive). "Faturado" é só a parte paga das músicas
 * tocadas, que é a base da divisão com a boate; cortesia e playlist automática ficam de fora.
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

  const parteUsuario = (bruto) => (bruto * config.divisaoUsuario) / 100;
  const porDia = [];
  const dia = new Date(inicio);
  for (let i = 0; i < dias; i++) {
    const chave = chaveDia(dia);
    const t = tocadasPorDia.get(chave);
    const p = pagamentosPorDia.get(chave);
    const bruto = t?.bruto ?? 0;
    porDia.push({
      dia: chave,
      tocadas: t?.tocadas ?? 0,
      cortesia: t?.cortesia ?? 0,
      bruto,
      usuario: parteUsuario(bruto),
      boate: bruto - parteUsuario(bruto),
      pagamentos: p?.pagamentos ?? 0,
      arrecadado: p?.arrecadado ?? 0,
    });
    dia.setDate(dia.getDate() + 1);
  }

  const soma = (campo) => porDia.reduce((total, linha) => total + linha[campo], 0);
  const totais = {
    tocadas: soma('tocadas'),
    cortesia: soma('cortesia'),
    bruto: soma('bruto'),
    usuario: soma('usuario'),
    boate: soma('boate'),
    pagamentos: soma('pagamentos'),
    arrecadado: soma('arrecadado'),
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
  };
}

// CSV para Excel brasileiro: separador ";", vírgula decimal e BOM para acentos.
export function paraCsv(relatorio) {
  const reais = (n) => n.toFixed(2).replace('.', ',');
  const data = (iso) => iso.split('-').reverse().join('/');
  const linhas = [
    ['Dia', 'Músicas tocadas', 'De cortesia', 'Faturado (R$)', 'Sua parte (R$)', 'Parte da boate (R$)', 'Pix recebido (R$)', 'Pagamentos'],
    ...relatorio.por_dia.map((d) => [data(d.dia), d.tocadas, d.cortesia, reais(d.bruto), reais(d.usuario), reais(d.boate), reais(d.arrecadado), d.pagamentos]),
    ['TOTAL', relatorio.totais.tocadas, relatorio.totais.cortesia, reais(relatorio.totais.bruto), reais(relatorio.totais.usuario), reais(relatorio.totais.boate), reais(relatorio.totais.arrecadado), relatorio.totais.pagamentos],
  ];
  return `﻿${linhas.map((linha) => linha.join(';')).join('\r\n')}\r\n`;
}
