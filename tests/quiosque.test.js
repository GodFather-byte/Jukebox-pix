import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ambiente = (extras) => ({
  ...process.env, DOTENV_CONFIG_PATH: path.join(raiz, 'tests', '.env-inexistente'), DOTENV_CONFIG_QUIET: 'true',
  NODE_ENV: 'test', PLAYER: 'sim', PAYMENT_PROVIDER: 'mock', PUBLIC_URL: '', ...extras,
});
const novaPasta = () => {
  const pasta = path.join(raiz, 'tests', `.quiosque-${randomUUID()}`);
  fs.mkdirSync(pasta, { recursive: true });
  return pasta;
};
// No Windows o banco fica preso até o processo sair de vez: tenta apagar de novo por alguns instantes.
const apagar = (pasta) => fs.rmSync(pasta, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
const pastaDeDados = (t) => {
  const pasta = novaPasta();
  t.after(() => apagar(pasta));
  return pasta;
};

async function portaLivre() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return port;
}

async function servidor(t, extras = {}) {
  const porta = await portaLivre();
  const dados = novaPasta();
  const filho = spawn(process.execPath, ['backend/server.js'], {
    cwd: raiz, env: ambiente({ JUKEBOX_DATA_DIR: dados, HOST: '127.0.0.1', PORT: String(porta), ...extras }), stdio: 'ignore',
  });
  // Um passo só: o servidor sai de vez e só então a pasta (com o banco) é apagada.
  const saiu = once(filho, 'exit');
  t.after(async () => {
    if (filho.exitCode === null && filho.signalCode === null) filho.kill('SIGKILL');
    await saiu;
    apagar(dados);
  });
  const base = `http://127.0.0.1:${porta}`;
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(2000) })).ok) break; } catch { /* subindo */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const api = async (rota, corpo) => {
    const r = await fetch(`${base}/api${rota}`, corpo === undefined ? { signal: AbortSignal.timeout(10_000) } : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(10_000),
    });
    return { status: r.status, dados: await r.json().catch(() => null) };
  };
  return { base, api };
}

test('jukebox: uma sessão só, nota e cartão creditam nela, e túnel/proxy fica de fora', { timeout: 30_000 }, async (t) => {
  const { base, api } = await servidor(t);
  // A máquina lista o acervo todo numa chamada só (banco novo: vazio).
  assert.deepEqual((await api('/cds')).dados, { cds: [] });

  const { dados: q } = await api('/quiosque');
  assert.deepEqual(q.metodos, { pix: true, cartao: true, nota: true });
  const sessao = q.sessao.id;
  assert.equal((await api('/quiosque')).dados.sessao.id, sessao, 'sempre a mesma sessão');

  assert.equal((await api('/quiosque/nota-teste', { valor: 10 })).status, 201);
  assert.equal((await api(`/sessoes/${sessao}`)).dados.saldo, 10);
  assert.equal((await api('/quiosque/nota-teste', { valor: 0 })).status, 400);

  const cartao = (await api('/pagamento/iniciar', { valor: 5, session_id: sessao, metodo: 'cartao', tipo_cartao: 'debito' })).dados;
  assert.equal(cartao.metodo, 'cartao');
  assert.equal(cartao.qr_imagem, null);
  // Outro cartão tira o anterior da maquininha.
  const outro = (await api('/pagamento/iniciar', { valor: 20, session_id: sessao, metodo: 'cartao' })).dados;
  assert.equal((await api(`/pagamento/${cartao.id}`)).dados.status, 'falho');
  await api(`/pagamento/mock/confirmar/${outro.id}`, {});
  assert.equal((await api(`/sessoes/${sessao}`)).dados.saldo, 30);

  const pix = (await api('/pagamento/iniciar', { valor: 5, session_id: sessao })).dados;
  assert.equal(pix.metodo, 'pix');
  assert.ok(pix.qr_imagem.startsWith('data:image/png'));
  assert.equal((await api('/pagamento/iniciar', { valor: 5, session_id: sessao, metodo: 'boleto' })).status, 400);

  const tunel = await fetch(`${base}/api/quiosque`, { headers: { 'X-Forwarded-For': '203.0.113.9' }, signal: AbortSignal.timeout(10_000) });
  assert.equal(tunel.status, 403, 'quem chega por túnel/proxy não é a tela do jukebox');
  const saude = await fetch(`${base}/healthz`, { headers: { 'X-Forwarded-For': '203.0.113.9' }, signal: AbortSignal.timeout(10_000) });
  assert.equal(saude.status, 200, 'o healthz continua aberto');
});

test('noteiro: pulsos seguidos viram uma nota, linha com valor é a nota, lixo é ignorado', { timeout: 20_000 }, (t) => {
  const codigo = `
    const { lerLinha } = await import('./backend/services/noteiro.js');
    const { sessaoDoQuiosque } = await import('./backend/services/quiosque.js');
    const { db } = await import('./backend/database.js');
    for (let i = 0; i < 5; i++) lerLinha('P');
    await new Promise((r) => setTimeout(r, 900));
    const depoisPulsos = sessaoDoQuiosque().saldo;
    lerLinha('20\\r');
    lerLinha('NOTEIRO OK');
    lerLinha('9999');
    const metodos = db.prepare("SELECT metodo, valor FROM pagamentos ORDER BY criado_em").all();
    console.log(JSON.stringify({ depoisPulsos, final: sessaoDoQuiosque().saldo, metodos }));
    db.close();
  `;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], {
    cwd: raiz, env: ambiente({ JUKEBOX_DATA_DIR: pastaDeDados(t), NOTEIRO_REAIS_POR_PULSO: '1' }), encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(r.status, 0, r.stderr);
  const saida = JSON.parse(r.stdout.trim().split('\n').at(-1));
  assert.equal(saida.depoisPulsos, 5);
  assert.equal(saida.final, 25);
  assert.deepEqual(saida.metodos, [{ metodo: 'nota', valor: 5 }, { metodo: 'nota', valor: 20 }]);
});
