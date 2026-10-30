import { config } from '../config.js';
import { db, registrarLogCd } from '../database.js';
import * as configuracoes from './configuracoes.js';
import { resumoPeriodo } from './relatorio.js';

// Relógio da máquina, para o operador conferir pelo botão de menu (dentro da máquina): quanto entrou desde
// sempre (total) e desde o último fechamento (parcial), por forma de pagamento, e a divisão com o ponto.
// Como nas jukeboxes de bar, a divisão é sobre o dinheiro que entrou; o relatório do painel continua pelo tocado.
const INICIO = '1970-01-01T00:00:00.000Z';
const CHAVE_ZERADO = 'relogio_zerado_em';
const CHAVE_ULTIMO = 'relogio_ultimo';

const agoraIso = () => new Date(Date.now() + 1000).toISOString(); // inclui o que acabou de confirmar

function totais(desde, ate) {
  const r = resumoPeriodo(desde, ate);
  const empresa = Math.round(r.arrecadado * config.divisaoUsuario) / 100;
  return {
    entrou: r.arrecadado,
    por_metodo: r.por_metodo,
    tocadas: r.tocadas,
    gratis: r.cortesia,
    empresa,
    ponto: r.arrecadado - empresa,
  };
}

function lerUltimo() {
  try {
    return JSON.parse(configuracoes.lerConfig(CHAVE_ULTIMO) || 'null');
  } catch {
    return null;
  }
}

export function lerRelogio() {
  const zeradoEm = configuracoes.lerConfig(CHAVE_ZERADO) || INICIO;
  const ate = agoraIso();
  const primeiro = db.prepare("SELECT MIN(confirmado_em) AS em FROM pagamentos WHERE status = 'confirmado'").get().em;
  return {
    maquina: config.nomeLocal,
    porcentagem_empresa: config.divisaoUsuario,
    total: totais(INICIO, ate),
    parcial: { desde: zeradoEm === INICIO ? primeiro : zeradoEm, ...totais(zeradoEm, ate) },
    ultimo_fechamento: lerUltimo(),
  };
}

// Fecha o caixa: guarda o parcial como "último fechamento" e começa um parcial novo a partir de agora.
export function fecharRelogio() {
  const relogio = lerRelogio();
  const fechamento = { em: new Date().toISOString(), total: relogio.total.entrou, ...relogio.parcial };
  db.transaction(() => {
    configuracoes.gravarConfig(CHAVE_ULTIMO, JSON.stringify(fechamento));
    configuracoes.gravarConfig(CHAVE_ZERADO, fechamento.em);
  })();
  registrarLogCd(null, 'Relógio', 'fechamento', `Fechamento no menu da máquina: entrou R$ ${fechamento.entrou} desde ${fechamento.desde ?? 'o início'}`);
  return lerRelogio();
}
