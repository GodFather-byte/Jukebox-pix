import { emitirSessao, emitirTodos } from '../events.js';
import { bonusAtivoAgora, lerVendas } from '../services/configuracoes.js';
import { verificarPendentes } from '../services/pagamentos.js';
import { limparAntigos } from '../services/fila.js';
import { expirarSessoes, limparSessoesVazias, obterSessao } from '../services/sessoes.js';

export function iniciarManutencao() {
  // Créditos de sessões inativas vencem; avisa o celular pra zerar o saldo na tela.
  setInterval(() => {
    for (const id of expirarSessoes()) emitirSessao(id, 'sessao', obterSessao(id));
  }, 30_000);

  setInterval(() => {
    limparSessoesVazias();
    limparAntigos();
  }, 60 * 60_000);

  // Os horários mudam sozinhos (vendas abrem/fecham, o bônus liga/desliga na hora marcada): avisa os celulares na virada.
  const situacaoDosHorarios = () => `${lerVendas().aberta}|${bonusAtivoAgora()}`;
  let ultimaSituacao = situacaoDosHorarios();
  setInterval(() => {
    const agora = situacaoDosHorarios();
    if (agora !== ultimaSituacao) {
      ultimaSituacao = agora;
      emitirTodos('config');
    }
  }, 15_000);

  let verificando = false;
  setInterval(async () => {
    if (verificando) return;
    verificando = true;
    try {
      await verificarPendentes();
    } finally {
      verificando = false;
    }
  }, 5_000);
}
