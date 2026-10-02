import { config } from '../../config.js';
import { mercadopago } from './mercadopago.js';
import { mock } from './mock.js';

// Para adicionar outro provedor (ex.: PagSeguro), crie um arquivo com a mesma interface
// { nome, criarCobranca, consultar, extrairPixId } e registre aqui.
const gateways = { mock, mercadopago };

export function obterGateway() {
  const gateway = gateways[config.pagamento.provedor];
  if (!gateway) {
    throw new Error(`PAYMENT_PROVIDER inválido: "${config.pagamento.provedor}" (use: ${Object.keys(gateways).join(', ')})`);
  }
  return gateway;
}
