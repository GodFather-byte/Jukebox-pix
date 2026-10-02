import { emitirSessao, emitirTodos } from '../events.js';
import { lerVendas } from '../services/configuracoes.js';
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

  // O horário de vendas muda sozinho (abre/fecha na hora marcada): avisa os celulares na virada.
  let vendasAbertas = lerVendas().aberta;
  setInterval(() => {
    const agora = lerVendas().aberta;
    if (agora !== vendasAbertas) {
      vendasAbertas = agora;
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
