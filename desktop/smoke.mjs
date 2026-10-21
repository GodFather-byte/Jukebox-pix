import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const { createSettings } = createRequire(import.meta.url)('./settings.cjs');
const executable = path.resolve(process.argv[2] || '');
assert.ok(process.argv[2] && fs.existsSync(executable), 'Informe o executável empacotado.');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-desktop-smoke-'));
const children = new Set();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sandboxArgs = process.platform === 'linux' && process.env.CI === 'true' ? ['--no-sandbox'] : [];

function launch(dir) {
  const child = spawn(executable, [...sandboxArgs, '--desktop-smoke-test', `--desktop-data-dir=${dir}`], {
    stdio: 'ignore', windowsHide: true,
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

async function waitExit(child, timeout = 75000) {
  if (child.exitCode !== null) return child.exitCode;
  let timer;
  try {
    return await Promise.race([
      once(child, 'exit').then(([code]) => code),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('O aplicativo não encerrou no prazo.')), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitReady(child, dir) {
  for (let i = 0; i < 700; i++) {
    if (fs.existsSync(path.join(dir, 'smoke-ready.json'))) return;
    assert.equal(child.exitCode, null, 'Aplicativo encerrou antes de carregar a interface.');
    await sleep(100);
  }
  throw new Error('Readiness do aplicativo não foi confirmada.');
}

function result(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'smoke-result.json'), 'utf8'));
}

async function freePort() {
  const server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

let occupied;
try {
  createSettings(directory, 'teste');
  fs.appendFileSync(path.join(directory, '.env'), `\nPORT=${await freePort()}\n`);
  const originalSettings = fs.readFileSync(path.join(directory, '.env'), 'utf8');
  const first = launch(directory);
  await waitReady(first, directory);
  const duplicate = launch(directory);
  assert.equal(await waitExit(duplicate, 5000), 0, 'A segunda instância deve sair sem iniciar outro backend.');
  assert.equal(first.exitCode, null, 'A primeira instância deve continuar aberta.');
  assert.equal(await waitExit(first), 0, 'Encerramento limpo via IPC deve sair com código zero.');
  assert.equal(result(directory).ok, true);
  assert.equal(result(directory).sqlite, true);
  assert.equal(result(directory).frontend, true);
  const databaseFile = path.join(directory, 'database', 'jukebox.db');
  const db = new DatabaseSync(databaseFile);
  db.exec("CREATE TABLE desktop_smoke (valor TEXT); INSERT INTO desktop_smoke VALUES ('preservado')");
  db.close();
  fs.rmSync(path.join(directory, 'smoke-ready.json'));
  fs.rmSync(path.join(directory, 'smoke-result.json'));
  const second = launch(directory);
  await waitReady(second, directory);
  assert.equal(await waitExit(second), 0);
  assert.equal(result(directory).ok, true);
  assert.equal(fs.readFileSync(path.join(directory, '.env'), 'utf8'), originalSettings);
  const reopened = new DatabaseSync(databaseFile);
  assert.equal(reopened.prepare('SELECT valor FROM desktop_smoke').get().valor, 'preservado');
  reopened.close();

  const conflictDir = path.join(directory, 'porta-ocupada');
  createSettings(conflictDir, 'teste');
  let requests = 0;
  occupied = http.createServer((_req, res) => {
    requests++;
    res.setHeader('Content-Type', 'application/json');
    res.end('{"ok":true}');
  });
  occupied.listen(0, '127.0.0.1');
  await once(occupied, 'listening');
  fs.appendFileSync(path.join(conflictDir, '.env'), `\nPORT=${occupied.address().port}\n`);
  const conflict = launch(conflictDir);
  assert.notEqual(await waitExit(conflict), 0);
  assert.equal(result(conflictDir).code, 'EADDRINUSE');
  assert.equal(requests, 0, 'Não deve consultar nem abrir outro servidor na porta ocupada.');
  console.log('Smoke aprovado: SQLite nativo, frontend, persistência, instância única, porta ocupada e encerramento.');
} finally {
  occupied?.closeAllConnections();
  occupied?.close();
  for (const child of children) {
    if (process.platform === 'win32' && child.pid) {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else child.kill('SIGKILL');
  }
  fs.rmSync(directory, { recursive: true, force: true });
}
