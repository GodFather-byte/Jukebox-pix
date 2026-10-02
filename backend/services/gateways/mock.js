import crypto from 'node:crypto';

// Gateway de desenvolvimento: gera um "Pix" falso e só confirma via /api/pagamento/mock/confirmar/:id.
export const mock = {
  nome: 'mock',

  async criarCobranca({ valor, referencia }) {
    return {
      pix_id: `mock_${crypto.randomUUID()}`,
      qr_code: `JUKEBOX-PIX-DE-TESTE|${referencia}|R$${valor.toFixed(2)}`,
    };
  },

  async consultar() {
    return 'pendente';
  },

  async cancelar() {},

  extrairPixId() {
    return null;
  },
};
