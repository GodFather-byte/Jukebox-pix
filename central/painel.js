import { db } from './db.js';

// A máquina manda relatório a cada 6 h: sem notícia há mais de 7 h, ela aparece como "sem enviar".
export const ONLINE_HORAS = 7;
const FUSO = process.env.CENTRAL_FUSO || 'America/Sao_Paulo';

const diaNoFuso = (data) => data.toLocaleDateString('sv-SE', { timeZone: FUSO });
const lerJson = (texto) => { try { return JSON.parse(texto); } catch { return null; } };

// Que máquinas cada um enxerga: o dono todas, o parceiro as dele, o ponto só a(s) da casa dele.
function maquinasDe(usuario) {
  const base = 'SELECT id, nome, local, parceiro_id, ponto_id, ultimo_em, ultimo FROM maquinas';
  if (usuario.papel === 'dono') return db.prepare(`${base} ORDER BY nome`).all();
  const coluna = usuario.papel === 'parceiro' ? 'parceiro_id' : 'ponto_id';
  return db.prepare(`${base} WHERE ${coluna} = ? ORDER BY nome`).all(usuario.id);
}

const VAZIO = { entrou: 0, pix: 0, nota: 0, cartao: 0, tocadas: 0 };

function somarDias(dias, filtro) {
  return dias.filter(filtro).reduce((t, d) => ({
    entrou: t.entrou + (d.entrou ?? 0),
    pix: t.pix + (d.pix ?? 0),
    nota: t.nota + (d.nota ?? 0),
    cartao: t.cartao + (d.cartao ?? 0),
    tocadas: t.tocadas + (d.tocadas ?? 0),
  }), { ...VAZIO });
}

function periodos(dias, hoje = new Date()) {
  const chaveHoje = diaNoFuso(hoje);
  const semana = new Date(hoje);
  semana.setDate(semana.getDate() - 6);
  const chaveSemana = diaNoFuso(semana);
  const mes = chaveHoje.slice(0, 7);
  return {
    hoje: somarDias(dias, (d) => d.dia === chaveHoje),
    semana: somarDias(dias, (d) => d.dia >= chaveSemana && d.dia <= chaveHoje),
    mes: somarDias(dias, (d) => d.dia.startsWith(mes)),
  };
}

// O ponto vê o que entrou e a parte dele; a parte da empresa e os valores do dono ficam de fora.
function paraPapel(relogio, papel) {
  if (!relogio || papel !== 'ponto') return relogio;
  const semEmpresa = (valores) => {
    if (!valores) return valores ?? null;
    const { empresa: _empresa, ...resto } = valores;
    return resto;
  };
  return {
    ...relogio,
    total: semEmpresa(relogio.total),
    parcial: semEmpresa(relogio.parcial),
    ultimo_fechamento: semEmpresa(relogio.ultimo_fechamento),
  };
}

function resumo(maquina, papel) {
  const dados = lerJson(maquina.ultimo);
  const online = Boolean(maquina.ultimo_em) && Date.now() - Date.parse(maquina.ultimo_em) < ONLINE_HORAS * 3_600_000;
  const pct = dados?.relogio?.porcentagem_empresa ?? 50;
  const dias = Array.isArray(dados?.dias) ? dados.dias : [];
  return {
    id: maquina.id,
    nome: maquina.nome,
    local: maquina.local,
    online,
    ultimo_em: maquina.ultimo_em,
    nunca_enviou: !maquina.ultimo_em,
    porcentagem_ponto: 100 - pct,
    periodos: periodos(dias),
    relogio: paraPapel(dados?.relogio ?? null, papel),
    status: dados?.status ?? null,
  };
}

const parteDoPonto = (valor, pctPonto) => Math.round(valor * pctPonto) / 100;

export function painel(usuario) {
  const maquinas = maquinasDe(usuario).map((m) => resumo(m, usuario.papel));
  const somar = (chave) => maquinas.reduce((t, m) => ({
    entrou: t.entrou + m.periodos[chave].entrou,
    pix: t.pix + m.periodos[chave].pix,
    nota: t.nota + m.periodos[chave].nota,
    cartao: t.cartao + m.periodos[chave].cartao,
    tocadas: t.tocadas + m.periodos[chave].tocadas,
    ponto: t.ponto + parteDoPonto(m.periodos[chave].entrou, m.porcentagem_ponto),
  }), { ...VAZIO, ponto: 0 });
  const alertas = maquinas.flatMap((m) => [
    ...(m.nunca_enviou ? [{ maquina: m.nome, id: m.id, tipo: 'nunca', texto: 'Ainda não mandou nenhum relatório.' }] : []),
    ...(!m.online && !m.nunca_enviou ? [{ maquina: m.nome, id: m.id, tipo: 'offline', texto: `Sem enviar há mais de ${ONLINE_HORAS} horas.` }] : []),
    ...(m.status?.alertas ?? []).map((texto) => ({ maquina: m.nome, id: m.id, tipo: 'maquina', texto })),
  ]);
  return {
    papel: usuario.papel,
    nome: usuario.nome,
    gerado_em: new Date().toISOString(),
    totais: { hoje: somar('hoje'), semana: somar('semana'), mes: somar('mes') },
    online: maquinas.filter((m) => m.online).length,
    maquinas,
    alertas,
  };
}

export function detalheDaMaquina(usuario, id) {
  const maquina = maquinasDe(usuario).find((m) => m.id === id);
  if (!maquina) return null;
  const dados = lerJson(maquina.ultimo);
  // Fechamentos que a máquina já mandou (um por relatório que trouxe um fechamento novo).
  const fechamentos = new Map();
  for (const linha of db.prepare('SELECT dados FROM relatorios WHERE maquina_id = ? ORDER BY recebido_em DESC LIMIT 400').all(id)) {
    const f = lerJson(linha.dados)?.relogio?.ultimo_fechamento;
    if (f?.em && !fechamentos.has(f.em)) fechamentos.set(f.em, paraPapel({ ultimo_fechamento: f }, usuario.papel).ultimo_fechamento);
  }
  return {
    ...resumo(maquina, usuario.papel),
    dias: Array.isArray(dados?.dias) ? dados.dias.slice(-14) : [],
    top: Array.isArray(dados?.top) ? dados.top.slice(0, 10) : [],
    versao: dados?.versao ?? null,
    fechamentos: [...fechamentos.values()].slice(0, 20),
  };
}
