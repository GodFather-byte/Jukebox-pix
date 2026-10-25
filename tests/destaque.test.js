import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trechos } from '../frontend/src/destaque.js';

const marcado = (texto, termo) => trechos(texto, termo).filter((p) => p.marca).map((p) => p.texto).join('');

test('destaque ignora acento e caixa e não marca o resto', () => {
  assert.equal(marcado('Forró Pé de Serra', 'forro'), 'Forró');
  assert.equal(marcado('Noite de Evidências', 'evidencias'), 'Evidências');
  assert.equal(marcado('Chitãozinho e Xororó', 'chitao xororo'), 'ChitãozinhoXororó');
  assert.deepEqual(trechos('Nada a ver', 'xyz'), [{ texto: 'Nada a ver', marca: false }]);
  assert.deepEqual(trechos('Curto', 'a'), [{ texto: 'Curto', marca: false }]);
  assert.equal(trechos('Forró', 'forro').map((p) => p.texto).join(''), 'Forró');
});
