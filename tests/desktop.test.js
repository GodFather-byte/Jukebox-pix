import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const { createSettings, readSettings, externalURL, localURL } = createRequire(import.meta.url)('../desktop/settings.cjs');

function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-settings-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('readiness do desktop usa o mesmo elemento de montagem do frontend', () => {
  const html = fs.readFileSync(new URL('../frontend/index.html', import.meta.url), 'utf8');
  const frontend = fs.readFileSync(new URL('../frontend/src/main.jsx', import.meta.url), 'utf8');
  const desktop = fs.readFileSync(new URL('../desktop/main.cjs', import.meta.url), 'utf8');
  assert.ok(html.includes('<div id="raiz">'));
  assert.ok(frontend.includes("document.getElementById('raiz')"));
  assert.ok(desktop.includes(`.includes('<div id="raiz">')`));
  assert.ok(desktop.includes('document.querySelector("#raiz")?.children.length'));
});

test('primeira execução exige escolha explícita, gera senha segura e não sobrescreve dados', (t) => {
  const dir = directory(t);
  assert.throws(() => createSettings(dir, 'outro'));
  createSettings(dir, 'teste');
  const original = fs.readFileSync(path.join(dir, '.env'), 'utf8');
  assert.throws(() => createSettings(dir, 'teste'), { code: 'EEXIST' });
  assert.equal(fs.readFileSync(path.join(dir, '.env'), 'utf8'), original);
  const { env, test } = readSettings(dir, { PATH: '/bin', NODE_OPTIONS: '--inspect', ADMIN_PASSWORD: 'admin', JUKEBOX_DATA_DIR: '/untrusted' });
  assert.equal(test, true);
  assert.equal(env.HOST, '127.0.0.1');
  assert.equal(env.NODE_ENV, 'development');
  assert.equal(env.PLAYER, 'sim');
  assert.equal(env.PAYMENT_PROVIDER, 'mock');
  assert.ok(env.ADMIN_PASSWORD.length >= 24);
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.JUKEBOX_DATA_DIR, dir);
  assert.equal(env.PATH, '/bin');
});

test('teste local nunca expõe mock à LAN mesmo se .env pedir', (t) => {
  const dir = directory(t);
  createSettings(dir, 'teste');
  fs.appendFileSync(path.join(dir, '.env'), '\nHOST=0.0.0.0\nPUBLIC_URL=https://example.org\nNODE_ENV=production\n');
  const { env } = readSettings(dir, {});
  assert.equal(env.HOST, '127.0.0.1');
  assert.equal(env.PUBLIC_URL, '');
  assert.equal(env.NODE_ENV, 'development');
});

test('produção incompleta ou insegura não inicia, e caminhos do operador são preservados', (t) => {
  const dir = directory(t);
  createSettings(dir, 'producao');
  assert.throws(() => readSettings(dir, {}), /MERCADOPAGO_ACCESS_TOKEN/);
  const file = path.join(dir, '.env');
  fs.appendFileSync(file, '\nMERCADOPAGO_ACCESS_TOKEN=valor-ficticio-para-teste\nMUSICAS_DIR=/acervo-do-operador\n');
  const { env } = readSettings(dir, {});
  assert.equal(env.NODE_ENV, 'production');
  assert.equal(env.HOST, '0.0.0.0');
  assert.equal(env.MUSICAS_DIR, '/acervo-do-operador');
  fs.appendFileSync(file, '\nADMIN_PASSWORD=admin\n');
  assert.throws(() => readSettings(dir, {}), /12 caracteres/);
});

test('nega configuração sem modo explícito, porta inválida e mock em produção', (t) => {
  const dir = directory(t);
  createSettings(dir, 'teste');
  const file = path.join(dir, '.env');
  fs.appendFileSync(file, '\nDESKTOP_MODE=\n');
  assert.throws(() => readSettings(dir, {}), /DESKTOP_MODE/);
  fs.appendFileSync(file, '\nDESKTOP_MODE=teste\nPORT=0\n');
  assert.throws(() => readSettings(dir, {}), /PORT/);
  fs.appendFileSync(file, '\nPORT=3000\nDESKTOP_MODE=producao\n');
  assert.throws(() => readSettings(dir, {}), /PAYMENT_PROVIDER/);
});

test('navegação é restrita à origem local e links externos à lista HTTPS permitida', () => {
  const origin = 'http://127.0.0.1:3000';
  assert.equal(localURL(`${origin}/tela`, origin), true);
  for (const url of ['https://example.org', 'javascript:alert(1)', 'file:///etc/passwd', `${origin}@example.org`, 'http://localhost:3000/admin']) {
    assert.equal(localURL(url, origin), false);
  }
  assert.equal(externalURL('https://mpv.io/installation/'), true);
  for (const url of ['http://mpv.io', 'https://mpv.io.evil.test', '******mpv.io', 'https://mpv.io:444', 'file:///tmp/test', 'https://example.org']) {
    assert.equal(externalURL(url), false);
  }
});
