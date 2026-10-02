import { config } from '../config.js';
import { agora, db } from '../database.js';
import { ErroApi } from '../erros.js';
import { creditar, criarSessao, obterSessao } from './sessoes.js';

// "Dia" é o dia do relógio do notebook (virada à meia-noite local), igual ao das estatísticas.
const diaLocal = (data = new Date()) => data.toLocaleDateString('sv-SE');

export function situacao() {
  const hoje = db.prepare('SELECT * FROM creditos_dono WHERE dia = ?').get(diaLocal()) ?? null;
  const liberaEm = new Date();
  liberaEm.setHours(24, 0, 0, 0);

  return {
    maximo: config.creditosDonoMax,
    usado_hoje: Boolean(hoje),
    hoje,
    libera_em: liberaEm.toISOString(),
    historico: db.prepare('SELECT * FROM creditos_dono ORDER BY dia DESC LIMIT 30').all(),
  };
}

// Os créditos vão num saldo à parte (cortesia): tocar com eles não entra no faturamento nem na
// divisão com a boate. Cai na sessão informada (a do navegador do dono) ou numa nova.
export const conceder = db.transaction((quantidade, sessionId) => {
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > config.creditosDonoMax) {
    throw new ErroApi(400, `Informe uma quantidade inteira de 1 a ${config.creditosDonoMax}.`);
  }

  const sessao = (sessionId && obterSessao(sessionId)) || criarSessao();

  try {
    db.prepare('INSERT INTO creditos_dono (dia, quantidade, session_id, criado_em) VALUES (?, ?, ?, ?)')
      .run(diaLocal(), quantidade, sessao.id, agora());
  } catch (erro) {
    if (erro.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      throw new ErroApi(409, 'Os créditos de cortesia de hoje já foram usados. Liberam de novo à meia-noite.', 'CORTESIA_USADA');
    }
    throw erro;
  }

  creditar(sessao.id, 0, quantidade);
  return obterSessao(sessao.id);
});
