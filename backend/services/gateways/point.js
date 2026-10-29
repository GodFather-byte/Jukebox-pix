import { config } from '../../config.js';
import { ErroApi } from '../../erros.js';
import { chamar } from './mercadopago.js';

// Cartão de débito e crédito na maquininha Mercado Pago Point (API de Orders, modo PDV).
// O jukebox manda o valor para a maquininha; o cliente passa o cartão nela; a confirmação vem da consulta à API.
const cfg = config.pagamento.mercadopago;

const FALHOS = new Set(['canceled', 'cancelled', 'failed', 'expired', 'refunded', 'rejected']);

export const point = {
  nome: 'mercadopago-point',

  async criarCobranca({ valor, referencia, descricao, tipoCartao }) {
    if (!cfg.terminal) throw new ErroApi(503, 'A maquininha ainda não foi configurada. Use Pix ou notas.', 'SEM_MAQUININHA');
    const ordem = await chamar('/v1/orders', {
      metodo: 'POST',
      idempotencia: referencia,
      corpo: {
        type: 'point',
        external_reference: referencia,
        description: descricao,
        transactions: { payments: [{ amount: valor.toFixed(2) }] },
        config: {
          point: { terminal_id: cfg.terminal, print_on_terminal: 'no_ticket' },
          payment_method: { default_type: tipoCartao === 'debito' ? 'debit_card' : 'credit_card' },
        },
      },
    });
    if (!ordem.id) throw new ErroApi(502, 'A maquininha não recebeu a cobrança. Tente de novo.');
    return { pix_id: String(ordem.id), qr_code: null };
  },

  async consultar(ordemId) {
    const ordem = await chamar(`/v1/orders/${encodeURIComponent(ordemId)}`);
    if (ordem.status === 'processed') return 'confirmado';
    if (FALHOS.has(ordem.status)) return 'falho';
    return 'pendente';
  },

  // Tira a cobrança da tela da maquininha (cliente desistiu ou o tempo acabou).
  async cancelar(ordemId) {
    await chamar(`/v1/orders/${encodeURIComponent(ordemId)}/cancel`, { metodo: 'POST', idempotencia: `${ordemId}-cancelar` });
  },

  extrairPixId() {
    return null;
  },
};
