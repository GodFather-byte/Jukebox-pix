import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SENHA_DONO = 'senha-do-dono-123';

const novaPasta = () => {
  const pasta = path.join(raiz, 'tests', `.central-${randomUUID()}`);
  fs.mkdirSync(pasta, { recursive: true });
  return pasta;
};

async function portaLivre() {
  const s = net.createServer();
  s.listen(0, '127.0.0.1');
  await new Promise((r) => s.once('listening', r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return port;
}

// Sobe a central num processo à parte, com banco próprio, e devolve um cliente HTTP simples.
// Um único after: no Windows o banco fica preso até o processo sair, então primeiro encerra e só depois apaga.
async function subirCentral(t) {
  const pasta = novaPasta();
  const porta = await portaLivre();
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: path.join(raiz, 'central'),
    env: { ...process.env, PORT: String(porta), CENTRAL_DB: path.join(pasta, 'central.db'), CENTRAL_SEGREDO: 'segredo-de-teste', CENTRAL_DONO_LOGIN: 'William', CENTRAL_DONO_SENHA: SENHA_DONO },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (proc.exitCode === null) {
      proc.kill();
      await new Promise((r) => proc.once('exit', r));
    }
    fs.rmSync(pasta, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  });
  const base = `http://127.0.0.1:${porta}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* subindo */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const chamar = async (caminho, { metodo = 'GET', corpo, token } = {}) => {
    const r = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: { ...(corpo && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    return { status: r.status, dados: await r.json().catch(() => null) };
  };
  return { base, chamar, pasta };
}

const relatorioDeTeste = (hoje) => ({
  versao: '1.0.0',
  relogio: {
    porcentagem_empresa: 50,
    total: { entrou: 100, por_metodo: { pix: 60, nota: 40, cartao: 0 }, tocadas: 90, empresa: 50, ponto: 50 },
    parcial: { desde: null, entrou: 30, por_metodo: { pix: 20, nota: 10, cartao: 0 }, tocadas: 25, empresa: 15, ponto: 15 },
    ultimo_fechamento: { em: '2026-10-28T19:18:12.000Z', entrou: 70, empresa: 35, ponto: 35 },
  },
  dias: [{ dia: hoje, entrou: 30, pix: 20, nota: 10, cartao: 0, tocadas: 25 }],
  top: [{ titulo: 'Rasteira', artista: 'Henrique e Juliano', vezes: 4 }],
  status: { noteiro: { ativo: true, conectado: true } },
});

test('central: dono cadastra, máquina manda relatório e cada acesso vê só o que é dele', { timeout: 60_000 }, async (t) => {
  const { chamar } = await subirCentral(t);
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

  assert.equal((await chamar('/api/login', { metodo: 'POST', corpo: { login: 'william', senha: 'errada' } })).status, 401);
  const dono = (await chamar('/api/login', { metodo: 'POST', corpo: { login: 'william', senha: SENHA_DONO } })).dados.token;
  assert.ok(dono, 'login do dono criado pelo ambiente (login sem diferença de maiúsculas)');

  const criar = (corpo) => chamar('/api/admin/usuarios', { metodo: 'POST', corpo, token: dono });
  assert.equal((await criar({ nome: 'Parceiro', login: 'parceiro', senha: 'senha-parceiro', papel: 'parceiro' })).status, 201);
  assert.equal((await criar({ nome: 'Boate', login: 'boate', senha: 'senha-da-boate', papel: 'ponto' })).status, 201);
  assert.equal((await criar({ nome: 'Outra', login: 'boate', senha: 'senha-da-boate', papel: 'ponto' })).status, 409);
  assert.equal((await criar({ nome: 'Curta', login: 'curta', senha: '123', papel: 'ponto' })).status, 400);

  const admin = (await chamar('/api/admin', { token: dono })).dados;
  const idDe = (login) => admin.usuarios.find((u) => u.login === login).id;
  const maquina = (await chamar('/api/admin/maquinas', { metodo: 'POST', token: dono, corpo: { nome: 'Máquina 224', local: 'Boate Estrela', parceiro_id: idDe('parceiro'), ponto_id: idDe('boate') } })).dados;
  const outra = (await chamar('/api/admin/maquinas', { metodo: 'POST', token: dono, corpo: { nome: 'Máquina 225' } })).dados;
  assert.match(maquina.token, /^jbx_/);

  assert.equal((await chamar('/api/maquina/relatorio', { metodo: 'POST', token: 'jbx_falso', corpo: relatorioDeTeste(hoje) })).status, 401);
  assert.equal((await chamar('/api/maquina/relatorio', { metodo: 'POST', token: maquina.token, corpo: { qualquer: 1 } })).status, 400);
  assert.equal((await chamar('/api/maquina/relatorio', { metodo: 'POST', token: maquina.token, corpo: relatorioDeTeste(hoje) })).status, 201);

  const painelDono = (await chamar('/api/painel', { token: dono })).dados;
  assert.equal(painelDono.maquinas.length, 2);
  assert.equal(painelDono.totais.hoje.entrou, 30);
  assert.equal(painelDono.totais.hoje.ponto, 15);
  assert.equal(painelDono.online, 1);
  assert.ok(painelDono.alertas.some((a) => a.maquina === 'Máquina 225' && a.tipo === 'nunca'));

  const parceiro = (await chamar('/api/login', { metodo: 'POST', corpo: { login: 'parceiro', senha: 'senha-parceiro' } })).dados.token;
  const painelParceiro = (await chamar('/api/painel', { token: parceiro })).dados;
  assert.deepEqual(painelParceiro.maquinas.map((m) => m.nome), ['Máquina 224'], 'parceiro vê só as máquinas dele');
  assert.equal(painelParceiro.maquinas[0].relogio.parcial.empresa, 15);
  assert.equal((await chamar(`/api/maquinas/${outra.id}`, { token: parceiro })).status, 404);
  assert.equal((await chamar('/api/admin', { token: parceiro })).status, 403);

  const boate = (await chamar('/api/login', { metodo: 'POST', corpo: { login: 'boate', senha: 'senha-da-boate' } })).dados.token;
  const detalhe = (await chamar(`/api/maquinas/${maquina.id}`, { token: boate })).dados;
  assert.equal(detalhe.relogio.parcial.ponto, 15);
  assert.equal(detalhe.relogio.parcial.empresa, undefined, 'o ponto não vê a parte da empresa');
  assert.equal(detalhe.relogio.total.empresa, undefined);
  assert.equal(detalhe.fechamentos[0].empresa, undefined);
  assert.equal(detalhe.fechamentos[0].ponto, 35);
  assert.equal(detalhe.top[0].titulo, 'Rasteira');

  // Token novo derruba o antigo.
  const novo = (await chamar(`/api/admin/maquinas/${maquina.id}/token`, { metodo: 'POST', token: dono })).dados.token;
  assert.equal((await chamar('/api/maquina/relatorio', { metodo: 'POST', token: maquina.token, corpo: relatorioDeTeste(hoje) })).status, 401);
  assert.equal((await chamar('/api/maquina/relatorio', { metodo: 'POST', token: novo, corpo: relatorioDeTeste(hoje) })).status, 201);

  assert.equal((await chamar('/api/painel', { token: 'sessao.falsa.123' })).status, 401);
});

test('jukebox → central: o relatório da máquina chega com o relógio, os dias e as mais pedidas', { timeout: 60_000 }, async (t) => {
  const { chamar, base, pasta } = await subirCentral(t);
  const dono = (await chamar('/api/login', { metodo: 'POST', corpo: { login: 'william', senha: SENHA_DONO } })).dados.token;
  const maquina = (await chamar('/api/admin/maquinas', { metodo: 'POST', token: dono, corpo: { nome: 'Piloto' } })).dados;

  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `
    const { creditarNota } = await import('./backend/services/noteiro.js');
    const { enviarRelatorio, montarRelatorio, situacaoCentral } = await import('./backend/services/central.js');
    creditarNota(20);
    const relatorio = montarRelatorio();
    const envio = await enviarRelatorio();
    console.log(JSON.stringify({ envio, dias: relatorio.dias.length, situacao: situacaoCentral() }));
  `], {
    cwd: raiz,
    env: { ...process.env, DOTENV_CONFIG_PATH: path.join(raiz, 'tests', '.env-inexistente'), DOTENV_CONFIG_QUIET: 'true', NODE_ENV: 'test', PLAYER: 'sim', PAYMENT_PROVIDER: 'mock',
      JUKEBOX_DATA_DIR: path.join(pasta, 'jukebox'), CENTRAL_URL: base, CENTRAL_TOKEN: maquina.token },
    encoding: 'utf8', timeout: 30_000,
  });
  assert.equal(r.status, 0, r.stderr);
  const saida = JSON.parse(r.stdout.trim().split('\n').at(-1));
  assert.deepEqual(saida.envio, { enviado: true });
  assert.equal(saida.dias, 40);
  assert.ok(saida.situacao.ultimo_envio);

  const painel = (await chamar('/api/painel', { token: dono })).dados;
  assert.equal(painel.maquinas[0].relogio.total.entrou, 20);
  assert.equal(painel.totais.hoje.nota, 20);
  assert.equal(painel.totais.hoje.entrou, 20);
});
