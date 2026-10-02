import { config } from '../config.js';
import { urlDoApp } from '../rede.js';
import { avisar, registrarConexaoDoProvedor, verificarDisco } from '../services/alertas.js';
import { verificar as verificarFechamento } from '../services/fechamento.js';
import { provedorOnline } from '../services/internet.js';

// Olho periódico: fechamento diário, conexão com o provedor de Pix e espaço em disco, tudo avisando no Telegram.
export function iniciarVigia() {
  const proteger = (promessa) => promessa?.catch?.((erro) => console.error('[vigia]', erro.message));

  proteger(avisar('inicio', `🟢 A jukebox ligou.\nClientes: ${urlDoApp()}`, { intervaloMin: 0, chave: 'inicio' }));
  proteger(verificarDisco());
  proteger(verificarFechamento());

  setInterval(() => proteger(verificarFechamento()), 60_000).unref?.();
  setInterval(() => proteger(verificarDisco()), 10 * 60_000).unref?.();

  if (config.pagamento.provedor !== 'mock') {
    setInterval(() => proteger(provedorOnline().then(registrarConexaoDoProvedor)), 2 * 60_000).unref?.();
  }
}
