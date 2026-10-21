import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { encerrarArvore, opcoesSubprocesso } from '../backend/subprocessos.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ambiente = (extras = {}) => {
  const env = { ...process.env };
  for (const nome of ['JUKEBOX_DATA_DIR', 'DB_PATH', 'MUSICAS_DIR', 'IMPORT_DIR', 'BACKUP_DIR', 'BACKUP_COPIA_DIR', 'PUBLIC_URL']) delete env[nome];
  return { ...env, DOTENV_CONFIG_PATH: path.join(raiz, 'tests', '.env-inexistente'), DOTENV_CONFIG_QUIET: 'true', ...extras };
};
const executar = (codigo, env = {}) => spawnSync(process.execPath, ['--input-type=module', '-e', codigo], {
  cwd: raiz, env: ambiente(env), encoding: 'utf8', timeout: 15_000,
});
const lerConfig = (env) => {
  const resultado = executar("import { config } from './backend/config.js'; console.log(JSON.stringify(config));", env);
  assert.equal(resultado.status, 0, resultado.stderr);
  return JSON.parse(resultado.stdout);
};
const pastaDeDados = (t) => {
  const pasta = path.join(raiz, 'tests', `.backend-data-${randomUUID()}`);
  fs.mkdirSync(pasta, { recursive: true });
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  return pasta;
};

test('caminhos padrão continuam na raiz e frontend não muda com a base gravável', () => {
  const padrao = lerConfig();
  assert.equal(padrao.dbPath, path.join(raiz, 'database', 'jukebox.db'));
  assert.equal(padrao.musicasDir, path.join(raiz, 'musicas'));
  assert.equal(padrao.backupDir, path.join(raiz, 'backups'));
  assert.equal(padrao.backupCopiaDir, null);
  const base = path.join(raiz, 'tests', 'dados com espaços');
  const config = lerConfig({ JUKEBOX_DATA_DIR: base });
  assert.equal(config.dbPath, path.join(base, 'database', 'jukebox.db'));
  assert.equal(config.musicasDir, path.join(base, 'musicas'));
  assert.equal(config.importDir, path.join(base, 'musicas', '_importar'));
  assert.equal(config.vinhetasDir, path.join(base, 'musicas', '_vinhetas'));
  assert.equal(config.cartazesDir, path.join(base, 'musicas', '_cartazes'));
  assert.equal(config.youtube.pasta, path.join(base, 'musicas', 'SobDemanda'));
  assert.equal(config.backupDir, path.join(base, 'backups'));
  assert.equal(config.frontendDist, path.join(raiz, 'frontend', 'dist'));
});

test('overrides relativos usam a base e caminhos absolutos são preservados', () => {
  const base = path.join(raiz, 'tests', 'dados');
  const absoluto = path.join(raiz, 'tests', 'acervo externo');
  const config = lerConfig({
    JUKEBOX_DATA_DIR: base, DB_PATH: 'db/local.db', MUSICAS_DIR: absoluto,
    IMPORT_DIR: 'entrada', BACKUP_DIR: 'copias', BACKUP_COPIA_DIR: 'segunda copia',
  });
  assert.equal(config.dbPath, path.join(base, 'db', 'local.db'));
  assert.equal(config.musicasDir, absoluto);
  assert.equal(config.importDir, path.join(base, 'entrada'));
  assert.equal(config.backupDir, path.join(base, 'copias'));
  assert.equal(config.backupCopiaDir, path.join(base, 'segunda copia'));
});

test('validarConfig preserva as duas recusas em produção', () => {
  for (const [provedor, senha, mensagem] of [
    ['mock', 'senha-forte-de-teste', /PAYMENT_PROVIDER=mock/],
    ['mercadopago', 'admin', /ADMIN_PASSWORD/],
  ]) {
    const resultado = executar("import { validarConfig } from './backend/config.js'; validarConfig();", {
      NODE_ENV: 'production', PAYMENT_PROVIDER: provedor, ADMIN_PASSWORD: senha,
    });
    assert.notEqual(resultado.status, 0);
    assert.match(resultado.stderr, mensagem);
  }
  const resultado = executar("import { validarConfig } from './backend/config.js'; validarConfig();", {
    NODE_ENV: 'production', PAYMENT_PROVIDER: 'mercadopago', ADMIN_PASSWORD: 'senha-forte-de-teste',
  });
  assert.equal(resultado.status, 0, resultado.stderr);
});

test('produção não troca player ausente por simulador', (t) => {
  const resultado = executar(`
    import { iniciar } from './backend/player.js';
    import { db } from './backend/database.js';
    try { iniciar(); } finally { db.close(); }
  `, {
    JUKEBOX_DATA_DIR: pastaDeDados(t), NODE_ENV: 'production', PLAYER: 'mpv',
    MPV_PATH: path.join(raiz, 'tests', 'mpv-inexistente'),
  });
  assert.notEqual(resultado.status, 0);
  assert.match(resultado.stderr, /Player "mpv" não encontrado/);
  assert.doesNotMatch(resultado.stderr, /usando player SIMULADO/);
});

test('CLI web mantém diagnóstico de player ausente sem MessagePort', (t) => {
  const resultado = executar("await import('./backend/server.js');", {
    JUKEBOX_DATA_DIR: pastaDeDados(t), NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '0',
    PLAYER: 'mpv', MPV_PATH: path.join(raiz, 'tests', 'mpv-inexistente'),
  });
  assert.equal(resultado.status, 1, resultado.stderr);
  assert.match(resultado.stderr, /Player "mpv" não encontrado/);
  assert.match(resultado.stderr, /Instale o mpv/);
});

test('ticks pendentes não consultam o banco nem reiniciam o player após parar', (t) => {
  const resultado = executar(`
    import { iniciar, parar, acordar, retomar } from './backend/player.js';
    import { db } from './backend/database.js';
    iniciar();
    acordar();
    parar();
    parar();
    db.close();
    retomar();
    acordar();
    await new Promise(resolve => setTimeout(resolve, 50));
  `, { JUKEBOX_DATA_DIR: pastaDeDados(t), NODE_ENV: 'test', PLAYER: 'sim' });
  assert.equal(resultado.status, 0, resultado.stderr);
});

test('encerrarArvore fecha também os pipes herdados pelo processo neto', { timeout: 10_000 }, async (t) => {
  const codigo = `
    const { spawn } = require('node:child_process');
    spawn(process.execPath, ['-e', "process.stdout.write('pronto\\\\n'); setInterval(() => {}, 1000);"], { stdio: 'inherit' });
    setInterval(() => {}, 1000);
  `;
  const proc = spawn(process.execPath, ['-e', codigo], {
    ...opcoesSubprocesso, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => encerrarArvore(proc));
  const fechado = once(proc, 'close');
  await once(proc.stdout, 'data');
  encerrarArvore(proc);
  let limite;
  try {
    await Promise.race([
      fechado,
      new Promise((_, reject) => { limite = setTimeout(() => reject(new Error('processo neto continuou vivo')), 5000); }),
    ]);
  } finally {
    clearTimeout(limite);
  }
});

function iniciarServidor(t, extras = {}) {
  const dados = pastaDeDados(t);
  // Emula a MessagePort do Electron sem exigir Electron nos testes do backend.
  const codigo = `
    import { EventEmitter } from 'node:events';
    process.parentPort = new EventEmitter();
    process.parentPort.postMessage = mensagem => process.send(mensagem);
    process.on('message', data => process.parentPort.emit('message', { data }));
    const { db } = await import('./backend/database.js');
    const fechar = db.close.bind(db);
    db.close = () => { fechar(); process.send({ type: 'db-closed', open: db.open }); };
    const backend = await import('./backend/server.js');
    if (!backend.servidor || typeof backend.encerrar !== 'function') throw new Error('exports ausentes');
  `;
  const filho = spawn(process.execPath, ['--input-type=module', '-e', codigo], {
    cwd: raiz, env: ambiente({
      NODE_ENV: 'test', JUKEBOX_DATA_DIR: dados, HOST: '127.0.0.1', PORT: '0',
      PLAYER: 'sim', PAYMENT_PROVIDER: 'mock', ...extras,
    }), stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let saida = '';
  filho.stdout.on('data', (parte) => { saida += parte; });
  filho.stderr.on('data', (parte) => { saida += parte; });
  const mensagens = [];
  filho.on('message', (mensagem) => mensagens.push(mensagem));
  const fim = once(filho, 'exit');
  t.after(async () => {
    if (filho.exitCode === null && filho.signalCode === null) {
      filho.kill('SIGKILL');
      await fim;
    }
  });
  const esperar = async (tipo) => {
    const limite = Date.now() + 15_000;
    while (!mensagens.some((m) => m.type === tipo)) {
      assert.equal(filho.exitCode, null, saida);
      assert.ok(Date.now() < limite, `Não recebeu ${tipo}: ${saida}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return mensagens.find((m) => m.type === tipo);
  };
  return { filho, mensagens, esperar, fim };
}

test('ready só chega com HTTP/SQLite prontos; shutdown encerra SSE e fecha banco', { timeout: 20_000 }, async (t) => {
  const servidor = iniciarServidor(t);
  const ready = await servidor.esperar('ready');
  assert.ok(ready.port > 0);
  assert.equal(ready.player, 'sim');
  assert.equal(new URL(ready.clientUrl).port, String(ready.port));
  assert.deepEqual(Object.keys(ready).sort(), ['clientUrl', 'player', 'port', 'type']);
  const resposta = await fetch(`http://127.0.0.1:${ready.port}/healthz`);
  assert.deepEqual(await resposta.json(), { ok: true });
  const req = http.get(`http://127.0.0.1:${ready.port}/api/eventos?tela=1`);
  t.after(() => req.destroy());
  const [sse] = await once(req, 'response');
  assert.match(sse.headers['content-type'], /text\/event-stream/);
  sse.resume();
  const sseFim = once(sse, 'end');
  servidor.filho.send({ type: 'shutdown' });
  servidor.filho.send({ type: 'shutdown' });
  const [codigo, sinal] = await servidor.fim;
  await sseFim;
  assert.equal(codigo, 0);
  assert.equal(sinal, null);
  assert.equal(servidor.mensagens.filter((m) => m.type === 'stopped').length, 1);
  assert.deepEqual(servidor.mensagens.find((m) => m.type === 'db-closed'), { type: 'db-closed', open: false });
});

test('porta ocupada envia apenas código seguro e limpa o banco', { timeout: 20_000 }, async (t) => {
  const ocupado = net.createServer();
  ocupado.listen(0, '127.0.0.1');
  await once(ocupado, 'listening');
  t.after(() => ocupado.close());
  const servidor = iniciarServidor(t, { PORT: String(ocupado.address().port), ADMIN_SECRET: 'nao-enviar-este-segredo' });
  const [codigo] = await servidor.fim;
  assert.equal(codigo, 1);
  assert.deepEqual(servidor.mensagens.find((m) => m.type === 'startup-error'), { type: 'startup-error', code: 'EADDRINUSE' });
  assert.equal(servidor.mensagens.some((m) => m.type === 'ready'), false);
  assert.deepEqual(servidor.mensagens.find((m) => m.type === 'db-closed'), { type: 'db-closed', open: false });
  assert.equal(JSON.stringify(servidor.mensagens).includes('nao-enviar-este-segredo'), false);
});

test('shutdown fecha HTTP preso e banco mesmo ao esgotar o prazo', { timeout: 20_000 }, async (t) => {
  const servidor = iniciarServidor(t);
  const ready = await servidor.esperar('ready');
  const socket = net.connect(ready.port, '127.0.0.1');
  t.after(() => socket.destroy());
  await once(socket, 'connect');
  socket.write('POST /api/sessoes HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 99999\r\n\r\n{');
  await new Promise((resolve) => setTimeout(resolve, 100));
  const inicio = Date.now();
  servidor.filho.send({ type: 'shutdown' });
  const [codigo] = await servidor.fim;
  assert.equal(codigo, 0);
  assert.ok(Date.now() - inicio >= 2500, 'deveria aguardar o prazo da requisição incompleta');
  assert.deepEqual(servidor.mensagens.find((m) => m.type === 'db-closed'), { type: 'db-closed', open: false });
  assert.equal(servidor.mensagens.filter((m) => m.type === 'stopped').length, 1);
});

test('heartbeat renova watchdog e a perda do pai encerra pelo mesmo cleanup', { timeout: 20_000 }, async (t) => {
  const servidor = iniciarServidor(t);
  await servidor.esperar('ready');
  const inicio = Date.now();
  await new Promise((resolve) => setTimeout(resolve, 1200));
  servidor.filho.send({ type: 'heartbeat' });
  const [codigo, sinal] = await servidor.fim;
  assert.ok(Date.now() - inicio >= 10_800, 'heartbeat deve renovar os dez segundos do watchdog');
  assert.equal(codigo, 0);
  assert.equal(sinal, null);
  assert.deepEqual(servidor.mensagens.find((m) => m.type === 'db-closed'), { type: 'db-closed', open: false });
  assert.equal(servidor.mensagens.filter((m) => m.type === 'stopped').length, 1);
});
