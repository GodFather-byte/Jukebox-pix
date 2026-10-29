import { config } from '../../config.js';
import { mercadopago } from './mercadopago.js';
import { mock } from './mock.js';
import { point } from './point.js';

// Para adicionar outro provedor (ex.: PagSeguro), crie um arquivo com a mesma interface
// { nome, criarCobranca, consultar, cancelar, extrairPixId } e registre aqui.
const gateways = { mock, mercadopago };

// Provedor do Pix.
export function obterGateway() {
  const gateway = gateways[config.pagamento.provedor];
  if (!gateway) {
    throw new Error(`PAYMENT_PROVIDER inválido: "${config.pagamento.provedor}" (use: ${Object.keys(gateways).join(', ')})`);
  }
  return gateway;
}

// Provedor do cartão: a maquininha Point quando o Pix é do Mercado Pago; no modo teste, o simulado.
export function obterGatewayCartao() {
  return config.pagamento.provedor === 'mercadopago' ? point : mock;
}

// Pagamento já gravado: consulta e cancela no provedor que gerou a cobrança.
export function gatewayPorNome(nome) {
  return { mock, mercadopago, [point.nome]: point }[nome] ?? null;
}
