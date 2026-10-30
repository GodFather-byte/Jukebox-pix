import assert from 'node:assert/strict';
import { test } from 'node:test';
import { motivoDaRecusa } from '../backend/services/gateways/mercadopago.js';

test('recusa do Mercado Pago vira um motivo que o dono entende', () => {
  assert.match(motivoDaRecusa(400, { message: 'Collector user without key enabled for QR render', cause: [{ code: 13253 }] }),
    /não tem chave Pix/);
  assert.match(motivoDaRecusa(401, { message: 'invalid access token' }), /Access Token é inválido/);
  assert.equal(motivoDaRecusa(400, { message: 'Algo novo\n do Mercado Pago', cause: [] }), 'Algo novo do Mercado Pago',
    'causa desconhecida: mostra a mensagem do próprio Mercado Pago, numa linha');
  assert.equal(motivoDaRecusa(400, { cause: [{ code: 999, description: 'descrição da causa' }] }), 'descrição da causa');
  assert.equal(motivoDaRecusa(500, {}), null);
  assert.ok(motivoDaRecusa(400, { message: 'x'.repeat(500) }).length <= 160);
});
