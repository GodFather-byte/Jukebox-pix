import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('confirmação repetida de Pix não duplica créditos e cancelamento posterior não os remove', (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-pagamento-'));
  t.after(() => fs.rmSync(dados, { recursive: true, force: true }));
  const codigo = `
    import assert from 'node:assert/strict';
    import { db } from './backend/database.js';
    import { criarSessao, obterSessao } from './backend/services/sessoes.js';
    import { iniciar, confirmar, cancelar, obter } from './backend/services/pagamentos.js';
    try {
      const sessao = criarSessao();
      const pagamento = await iniciar({ valor: 5, sessionId: sessao.id });
      assert.equal(obterSessao(sessao.id).saldo, 0);
      assert.equal(confirmar(pagamento.id), true);
      const saldoConfirmado = obterSessao(sessao.id).saldo;
      assert.equal(saldoConfirmado, pagamento.creditos + pagamento.bonus);
      assert.equal(confirmar(pagamento.id), false);
      assert.equal(obterSessao(sessao.id).saldo, saldoConfirmado);
      const cancelado = await cancelar(pagamento.id);
      assert.equal(cancelado.status, 'confirmado');
      assert.equal(obter(pagamento.id).status, 'confirmado');
      assert.equal(obterSessao(sessao.id).saldo, saldoConfirmado);
    } finally {
      db.close();
    }
  `;
  const resultado = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], {
    cwd: raiz,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PLAYER: 'sim',
      PAYMENT_PROVIDER: 'mock',
      JUKEBOX_DATA_DIR: dados,
      DOTENV_CONFIG_PATH: path.join(raiz, 'tests', '.env-inexistente'),
      DOTENV_CONFIG_QUIET: 'true',
    },
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.equal(resultado.status, 0, resultado.stderr);
});
