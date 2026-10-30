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

  const cartao = (await api('/pagamento/iniciar', { valor: 10, session_id: sessao, metodo: 'cartao', tipo_cartao: 'debito' })).dados;
  assert.equal(cartao.metodo, 'cartao');
  assert.equal(cartao.qr_imagem, null);
  // Outro cartão tira o anterior da maquininha.
  const outro = (await api('/pagamento/iniciar', { valor: 20, session_id: sessao, metodo: 'cartao' })).dados;
  assert.equal((await api(`/pagamento/${cartao.id}`)).dados.status, 'falho');
  await api(`/pagamento/mock/confirmar/${outro.id}`, {});
  assert.equal((await api(`/sessoes/${sessao}`)).dados.saldo, 30);

  const pix = (await api('/pagamento/iniciar', { valor: 10, session_id: sessao })).dados;
  // Limite por compra (padrão R$ 10 a R$ 50): nem troco miúdo nem R$ 500 de uma vez.
  assert.equal((await api('/pagamento/iniciar', { valor: 5, session_id: sessao })).status, 400);
  assert.equal((await api('/pagamento/iniciar', { valor: 60, session_id: sessao })).status, 400);
  assert.equal(pix.metodo, 'pix');
  assert.ok(pix.qr_imagem.startsWith('data:image/png'));
  assert.equal((await api('/pagamento/iniciar', { valor: 10, session_id: sessao, metodo: 'boleto' })).status, 400);

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

// Roda um trecho com o banco de uma pasta de dados e devolve a última linha impressa (JSON).
function rodar(t, codigo, extras = {}, dados = pastaDeDados(t)) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], {
    cwd: raiz, env: ambiente({ JUKEBOX_DATA_DIR: dados, ...extras }), encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim().split('\n').at(-1));
}

test('créditos da máquina não vencem por padrão; com SESSAO_TTL_MIN eles vencem', { timeout: 30_000 }, (t) => {
  const codigo = `
    const { sessaoDoQuiosque } = await import('./backend/services/quiosque.js');
    const { creditar, debitar, expirarSessoes, obterSessao } = await import('./backend/services/sessoes.js');
    const { db } = await import('./backend/database.js');
    const id = sessaoDoQuiosque().id;
    creditar(id, 10);
    // Finge que a última vez que alguém mexeu foi há dois dias.
    db.prepare("UPDATE sessoes SET expira_em = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(id);
    const vencidas = expirarSessoes();
    const saldo = obterSessao(id).saldo;
    const debito = debitar(id, 3);
    console.log(JSON.stringify({ vencidas: vencidas.length, saldo, debitou: Boolean(debito), final: obterSessao(id).saldo }));
    db.close();
  `;
  assert.deepEqual(rodar(t, codigo), { vencidas: 0, saldo: 10, debitou: true, final: 7 });
  assert.deepEqual(rodar(t, codigo, { SESSAO_TTL_MIN: '60' }), { vencidas: 1, saldo: 0, debitou: false, final: 0 });
});

test('playlist automática espera o intervalo de silêncio antes de sortear', { timeout: 60_000 }, (t) => {
  const dados = pastaDeDados(t);
  const seed = spawnSync(process.execPath, ['backend/seed.js'], { cwd: raiz, env: ambiente({ JUKEBOX_DATA_DIR: dados }), encoding: 'utf8', timeout: 30_000 });
  assert.equal(seed.status, 0, seed.stderr);
  const codigo = (intervalo) => `
    const configuracoes = await import('./backend/services/configuracoes.js');
    const player = await import('./backend/player.js');
    const { db } = await import('./backend/database.js');
    configuracoes.salvarAutomatico({ ativo: true, intervalo_min: ${intervalo} });
    player.iniciar();
    await new Promise((r) => setTimeout(r, 2500));
    const tocando = player.estado().tocando;
    player.parar();
    console.log(JSON.stringify({ tocando, intervalo: configuracoes.lerAutomatico().intervalo_min }));
    db.close();
  `;
  // Padrão novo: 5 minutos de silêncio antes da aleatória.
  assert.deepEqual(rodar(t, codigo(5), {}, dados), { tocando: false, intervalo: 5 });
  // Zero: toca na hora, como antes.
  assert.deepEqual(rodar(t, codigo(0), {}, dados), { tocando: true, intervalo: 0 });
});

test('aleatória: sorteia entre as mais tocadas, sem repetir a recente; padrões de volume e vinheta', { timeout: 60_000 }, (t) => {
  const dados = pastaDeDados(t);
  const seed = spawnSync(process.execPath, ['backend/seed.js'], { cwd: raiz, env: ambiente({ JUKEBOX_DATA_DIR: dados }), encoding: 'utf8', timeout: 30_000 });
  assert.equal(seed.status, 0, seed.stderr);
  const saida = rodar(t, `
    const fila = await import('./backend/services/fila.js');
    const configuracoes = await import('./backend/services/configuracoes.js');
    const { db } = await import('./backend/database.js');
    db.prepare('UPDATE musicas SET vezes_tocada = 0').run();
    const [a, b] = db.prepare('SELECT id FROM musicas ORDER BY rowid LIMIT 2').all().map((m) => m.id);
    db.prepare('UPDATE musicas SET vezes_tocada = 50 WHERE id IN (?, ?)').run(a, b);
    const sorteadas = new Set();
    for (let i = 0; i < 20; i++) {
      const item = fila.criarAutomatico([], [], { soTop: true });
      sorteadas.add(item.musica_id);
      db.prepare('DELETE FROM fila WHERE id = ?').run(item.id);
    }
    // Com as duas top tocadas há pouco, cai no acervo em vez de repetir.
    const semRepetir = fila.criarAutomatico([a, b], [], { soTop: true }).musica_id;
    const padroes = configuracoes.lerAutomatico();
    let recusou = false;
    try { configuracoes.salvarAutomatico({ volume: 10 }); } catch { recusou = true; }
    console.log(JSON.stringify({
      soTop: [...sorteadas].every((id) => id === a || id === b),
      semRepetir: semRepetir !== a && semRepetir !== b,
      padroes: { so_top: padroes.so_top, volume: padroes.volume, vinheta: padroes.vinheta, intervalo: padroes.intervalo_min },
      recusou,
    }));
    db.close();
  `, {}, dados);
  assert.deepEqual(saida, {
    soTop: true, semRepetir: true, padroes: { so_top: true, volume: 80, vinheta: true, intervalo: 5 }, recusou: true,
  });
});

test('placa JukeLinux: 20 teclas de crédito seguidas viram R$ 20 de uma vez; sem NOTEIRO=teclado não credita', { timeout: 30_000 }, (t) => {
  const codigo = `
    const { pulsoDeTeclado, situacaoNoteiro } = await import('./backend/services/noteiro.js');
    const { sessaoDoQuiosque } = await import('./backend/services/quiosque.js');
    const { config } = await import('./backend/config.js');
    const { db } = await import('./backend/database.js');
    const aceitos = [];
    for (let i = 0; i < 20; i++) { aceitos.push(Boolean(pulsoDeTeclado())); await new Promise((r) => setTimeout(r, 140)); }
    await new Promise((r) => setTimeout(r, 900));
    const notas = db.prepare("SELECT valor FROM pagamentos WHERE metodo = 'nota'").all().map((p) => p.valor);
    const s = situacaoNoteiro();
    console.log(JSON.stringify({ aceitos: aceitos.filter(Boolean).length, saldo: sessaoDoQuiosque().saldo, notas,
      ativo: s.ativo, conectado: s.conectado, perfil: config.tecladoPerfil, tecla: config.noteiro.tecla }));
    db.close();
  `;
  const jukelinux = rodar(t, codigo, { NOTEIRO: 'teclado', TECLADO_PERFIL: 'jukelinux' });
  assert.deepEqual(jukelinux, { aceitos: 20, saldo: 20, notas: [20], ativo: true, conectado: true, perfil: 'jukelinux', tecla: 'KeyU' });

  const desligado = rodar(t, codigo, { NOTEIRO: 'desligado' });
  assert.equal(desligado.aceitos, 0);
  assert.equal(desligado.saldo, 0);
  assert.equal(desligado.perfil, 'padrao');
});

test('menu do operador: relógio total e parcial, divisão com o ponto e fechamento que zera só o parcial', { timeout: 20_000 }, (t) => {
  const r = rodar(t, `
    const { creditarNota } = await import('./backend/services/noteiro.js');
    const { lerRelogio, fecharRelogio } = await import('./backend/services/relogio.js');
    creditarNota(20);
    creditarNota(10);
    const antes = lerRelogio();
    await new Promise((r) => setTimeout(r, 1100));
    const fechado = fecharRelogio();
    await new Promise((r) => setTimeout(r, 1100));
    creditarNota(5);
    const depois = lerRelogio();
    console.log(JSON.stringify({ antes, fechado, depois }));
  `, { DIVISAO_USUARIO: '50' });

  assert.equal(r.antes.total.entrou, 30);
  assert.equal(r.antes.parcial.entrou, 30);
  assert.equal(r.antes.parcial.por_metodo.nota, 30);
  assert.deepEqual([r.antes.parcial.empresa, r.antes.parcial.ponto], [15, 15]);

  assert.equal(r.fechado.parcial.entrou, 0, 'o fechamento zera o parcial');
  assert.equal(r.fechado.total.entrou, 30, 'o total nunca zera');
  assert.equal(r.fechado.ultimo_fechamento.entrou, 30);

  assert.equal(r.depois.parcial.entrou, 5);
  assert.equal(r.depois.total.entrou, 35);
});

test('palhinha: a aleatória toca só o trecho configurado; música paga e padrão tocam inteiras', { timeout: 20_000 }, (t) => {
  const r = rodar(t, `
    const { argumentosMpv, argumentosVlc } = await import('./backend/audio.js');
    const cfg = await import('./backend/services/configuracoes.js');
    const padrao = cfg.lerAutomatico().trecho_seg;
    cfg.salvarAutomatico({ trecho_seg: 120 });
    let erro = null;
    try { cfg.salvarAutomatico({ trecho_seg: 9999 }); } catch (e) { erro = e.message; }
    console.log(JSON.stringify({
      padrao, salvo: cfg.automaticoTrechoSeg(), erro,
      mpv: argumentosMpv('a.mp3', { duracao: 120 }), mpvInteira: argumentosMpv('a.mp3'),
      vlc: argumentosVlc('a.mp3', { duracao: 120 }),
    }));
  `);
  assert.equal(r.padrao, 0, 'por padrão a aleatória toca inteira');
  assert.equal(r.salvo, 120);
  assert.match(r.erro, /Trecho/);
  assert.ok(r.mpv.includes('--length=120'));
  assert.ok(!r.mpvInteira.some((a) => a.startsWith('--length')));
  assert.ok(r.vlc.includes('--stop-time=120'));
});

test('sorteio de crédito: música paga concorre e o prêmio é cortesia; limite de Pix a cada 30 minutos', { timeout: 20_000 }, (t) => {
  const r = rodar(t, `
    const { db } = await import('./backend/database.js');
    const cfg = await import('./backend/services/configuracoes.js');
    const fila = await import('./backend/services/fila.js');
    const { creditarNota } = await import('./backend/services/noteiro.js');
    const { sessaoDoQuiosque } = await import('./backend/services/quiosque.js');
    const { iniciar } = await import('./backend/services/pagamentos.js');
    const agora = new Date().toISOString();
    db.prepare("INSERT INTO categorias (id, nome, icone, cor) VALUES ('pop', 'Pop', '🎵', '#fff')").run();
    db.prepare("INSERT INTO artistas (id, nome, categoria_id, criado_em) VALUES ('a', 'A', 'pop', ?)").run(agora);
    db.prepare("INSERT INTO cds (id, titulo, artista_id, categoria_id, status, data_criacao, data_lancamento, criado_em) VALUES ('c', 'C', 'a', 'pop', 'lancado', ?, ?, ?)").run(agora, agora, agora);
    for (const id of ['m1', 'm2', 'm3']) db.prepare("INSERT INTO musicas (id, titulo, cd_id, duracao, creditos, arquivo, criado_em) VALUES (?, ?, 'c', 180, 1, 'x.mp3', ?)").run(id, id, agora);

    const sessao = sessaoDoQuiosque().id;
    creditarNota(10);
    const semSorteio = fila.adicionar(sessao, 'm1');
    cfg.salvarRegras({ sorteio: { a_cada: 2 } });
    fila.definirSorteio(() => 0.1); // 0,1 < 1/2: ganha
    const ganhou = fila.adicionar(sessao, 'm2');
    fila.definirSorteio(() => 0.9); // perde
    const perdeu = fila.adicionar(sessao, 'm3');
    const s = db.prepare('SELECT saldo, saldo_cortesia FROM sessoes WHERE id = ?').get(sessao);

    // Limite: R$ 100 em 30 min. Dois Pix de 50 confirmados; o terceiro é recusado.
    for (let i = 0; i < 2; i++) {
      const p = await iniciar({ valor: 50, sessionId: sessao });
      db.prepare("UPDATE pagamentos SET status = 'confirmado', confirmado_em = ? WHERE id = ?").run(new Date().toISOString(), p.id);
    }
    let erro = null;
    try { await iniciar({ valor: 10, sessionId: sessao }); } catch (e) { erro = e.codigo; }
    cfg.salvarRegras({ limite_30min: 0 });
    const liberado = Boolean(await iniciar({ valor: 10, sessionId: sessao }));
    console.log(JSON.stringify({ premios: [semSorteio.premio, ganhou.premio, perdeu.premio], s, erro, liberado }));
  `);
  assert.deepEqual(r.premios, [0, 1, 0]);
  // 10 pagos + 1 do sorteio - 3 músicas = 8; a 3ª música já gastou o crédito do prêmio (cortesia sai primeiro).
  assert.deepEqual(r.s, { saldo: 8, saldo_cortesia: 0 });
  assert.equal(r.erro, 'LIMITE_PERIODO');
  assert.equal(r.liberado, true, 'limite 0 desliga');
});

test('alerta de dinheiro demais: passa do limite em 10 minutos e é marcado, sem bloquear o crédito', { timeout: 20_000 }, (t) => {
  const r = rodar(t, `
    const { creditarNota, situacaoNoteiro } = await import('./backend/services/noteiro.js');
    const { sessaoDoQuiosque } = await import('./backend/services/quiosque.js');
    creditarNota(100);
    const primeira = situacaoNoteiro().ultima.suspeito;
    creditarNota(60);
    const segunda = situacaoNoteiro().ultima.suspeito;
    console.log(JSON.stringify({ primeira, segunda, saldo: sessaoDoQuiosque().saldo }));
  `, { CREDITO_ALERTA_10MIN: '150' });
  assert.deepEqual(r, { primeira: false, segunda: true, saldo: 160 });
});
