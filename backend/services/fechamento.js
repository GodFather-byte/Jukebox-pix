import { config } from '../config.js';
import * as configuracoes from './configuracoes.js';
import * as relatorio from './relatorio.js';
import * as telegram from './telegram.js';

// Fechamento diário no Telegram. O período é a "noite": as 24 h que terminam na hora marcada, então uma
// noite que atravessa a meia-noite cai inteira no mesmo fechamento.
const TOLERANCIA_MS = 20 * 60 * 60_000; // notebook ligado até 20 h depois da hora marcada ainda manda o que ficou pendente

const chaveDia = (data) => data.toLocaleDateString('sv-SE');
const reais = (valor) => Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataHora = (data) => data.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const plural = (n, singular, pluralTexto) => `${n} ${n === 1 ? singular : pluralTexto}`;

function horarioMarcado(hora, dia) {
  const [h, m] = hora.split(':').map(Number);
  const data = new Date(dia);
  data.setHours(h, m, 0, 0);
  return data;
}

// O último horário marcado que já passou (hoje, ou ontem se ainda não chegou a hora de hoje).
export function ultimoHorarioMarcado(hora, agora = new Date()) {
  const hoje = horarioMarcado(hora, agora);
  if (agora >= hoje) return hoje;
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);
  return ontem;
}

export function periodoQueTermina(ate) {
  const de = new Date(ate);
  de.setDate(de.getDate() - 1);
  return { de, ate };
}

// Versão do dono mostra tudo; a da boate só o que ela precisa para conferir o repasse.
export function montarTexto(resumo, periodo, { para = 'dono', top = [] } = {}) {
  const pct = config.divisaoUsuario;
  const linhas = [
    `📊 Fechamento — ${config.nomeLocal}${para === 'boate' ? ' (parte da casa)' : ''}`,
    `🗓 ${dataHora(periodo.de)} → ${dataHora(periodo.ate)}`,
    '',
    `🎶 ${plural(resumo.tocadas, 'música tocada', 'músicas tocadas')}${para === 'dono' && resumo.cortesia > 0 ? ` (${resumo.cortesia} de cortesia)` : ''}`,
  ];
  if (resumo.recados > 0) linhas.push(`💬 ${plural(resumo.recados, 'recado no telão', 'recados no telão')}`);
  linhas.push(`💰 Faturado no período: ${reais(resumo.bruto)}`);

  if (para === 'boate') {
    linhas.push(`🏠 Parte da boate (${100 - pct}%): ${reais(resumo.boate)} — valor a repassar`);
    return linhas.join('\n');
  }

  linhas.push(`👤 Sua parte (${pct}%): ${reais(resumo.usuario)}`);
  linhas.push(`🏠 Parte da boate (${100 - pct}%): ${reais(resumo.boate)}`);
  linhas.push(`📲 Pix recebido: ${reais(resumo.arrecadado)} (${plural(resumo.pagamentos, 'pagamento', 'pagamentos')}${resumo.pagamentos ? `, ticket médio ${reais(resumo.ticket_medio)}` : ''})`);
  if (resumo.vales > 0) linhas.push(`🎟 ${plural(resumo.vales, 'vale resgatado', 'vales resgatados')} (${resumo.vales_creditos} créditos de cortesia)`);
  if (top.length) {
    linhas.push('', '🏆 Mais tocadas:');
    top.forEach((m, i) => linhas.push(`${i + 1}. ${m.titulo} — ${m.artista} (${m.tocadas}x)`));
  }
  return linhas.join('\n');
}

export async function enviarFechamento({ de, ate }, { incluirBoate = false } = {}) {
  const desde = de.toISOString();
  const ateIso = ate.toISOString();
  const resumo = relatorio.resumoPeriodo(desde, ateIso);
  const top = relatorio.topMusicasDoPeriodo(desde, ateIso, 3);

  const dono = await telegram.enviar(montarTexto(resumo, { de, ate }, { para: 'dono', top }), { para: 'dono' });
  let boate = null;
  if (incluirBoate && telegram.boateConfigurada()) {
    boate = await telegram.enviar(montarTexto(resumo, { de, ate }, { para: 'boate' }), { para: 'boate' });
  }
  return { dono, boate, resumo };
}

// Chamado a cada minuto: manda o fechamento do último horário marcado, uma vez só (mesmo reiniciando o servidor).
let enviando = false;
export async function verificar(agora = new Date()) {
  const cfg = configuracoes.lerFechamento();
  if (!cfg.ativo || !telegram.configurado() || enviando) return null;

  const ate = ultimoHorarioMarcado(cfg.hora, agora);
  const chave = chaveDia(ate);
  if (configuracoes.lerConfig('fechamento_ultimo') === chave) return null;
  if (agora - ate > TOLERANCIA_MS) return null;

  enviando = true;
  try {
    const resultado = await enviarFechamento(periodoQueTermina(ate), { incluirBoate: cfg.boate });
    if (resultado.dono.ok) configuracoes.gravarConfig('fechamento_ultimo', chave);
    else console.error(`[fechamento] não enviou: ${resultado.dono.motivo} (tenta de novo em 1 min)`);
    if (resultado.boate && !resultado.boate.ok) console.error(`[fechamento] não enviou à boate: ${resultado.boate.motivo}`);
    return resultado;
  } finally {
    enviando = false;
  }
}
