import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createSettings, readSettings, lerConfiguracao, salvarConfiguracao, atualizarEnv, externalURL, localURL } = require('../desktop/settings.cjs');
const { ferramentasEmbutidas } = require('../desktop/ferramentas.cjs');
const { aplicarLinux } = require('../desktop/inicio-automatico.cjs');

test('abrir ao ligar: a escolha da tela vai para o .env e o atalho do Linux é criado e removido', (t) => {
  const dir = directory(t);
  assert.equal(lerConfiguracao(dir).iniciarComSistema, true, 'primeira vez: já vem marcado');
  salvarConfiguracao(dir, { modo: 'teste', senha: 'senha-bem-forte', porta: 3000, iniciarComSistema: true });
  assert.equal(readSettings(dir, {}).iniciarComSistema, true);
  salvarConfiguracao(dir, { modo: 'teste', senha: 'senha-bem-forte', porta: 3000, iniciarComSistema: false });
  assert.equal(readSettings(dir, {}).iniciarComSistema, false);

  const autostart = path.join(dir, 'autostart');
  aplicarLinux(true, '/opt/Jukebox Pix/jukebox-pix', autostart);
  const atalho = fs.readFileSync(path.join(autostart, 'jukebox-pix.desktop'), 'utf8');
  assert.match(atalho, /^Exec="\/opt\/Jukebox Pix\/jukebox-pix"$/m);
  aplicarLinux(false, '/opt/Jukebox Pix/jukebox-pix', autostart);
  assert.equal(fs.existsSync(path.join(autostart, 'jukebox-pix.desktop')), false);
});

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
  assert.match(desktop, /fetch\(`\$\{origin\}\/tela`/);
  assert.match(desktop, /mainWindow = windowFor\(`\$\{origin\}\/tela`/);
  assert.ok(desktop.includes('Abrir telão'));
  assert.ok(!desktop.includes('Catálogo do cliente'), 'o cliente não usa mais o celular');
  assert.ok(desktop.includes('Painel administrativo'));
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
  assert.equal(env.HOST, '127.0.0.1', 'só a tela do jukebox acessa o servidor');
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

test('tela de configuração grava o .env, mantém ajustes do dono e não aceita produção sem token', (t) => {
  const dir = directory(t);
  const novo = lerConfiguracao(dir);
  assert.equal(novo.existe, false);
  assert.ok(novo.senha.length >= 12);
  assert.throws(() => salvarConfiguracao(dir, { modo: 'producao', senha: 'senha-bem-forte', porta: 3000 }), /Access Token/);
  assert.equal(fs.existsSync(path.join(dir, '.env')), false, 'falha na primeira vez não deixa .env pela metade');
  assert.throws(() => salvarConfiguracao(dir, { modo: 'teste', senha: 'curta', porta: 3000 }), /12 caracteres/);
  assert.throws(() => salvarConfiguracao(dir, { modo: 'teste', senha: 'senha-bem-forte', porta: 80 }), /porta/);

  salvarConfiguracao(dir, { modo: 'producao', nomeLocal: 'Boate Estrela', senha: 'minha senha #1 "forte"', porta: 3100, token: 'APP_USR-ficticio' });
  let { env, port, test } = readSettings(dir, {});
  assert.equal(test, false);
  assert.equal(port, 3100);
  assert.equal(env.ADMIN_PASSWORD, 'minha senha #1 "forte"');
  assert.equal(env.NOME_LOCAL, 'Boate Estrela');
  assert.equal(env.MERCADOPAGO_ACCESS_TOKEN, 'APP_USR-ficticio');
  assert.equal(env.PAYMENT_PROVIDER, 'mercadopago');
  const segredo = env.ADMIN_SECRET;

  const lido = lerConfiguracao(dir);
  assert.equal(lido.temToken, true);
  assert.equal(JSON.stringify(lido).includes('APP_USR-ficticio'), false, 'o token não vai para a tela');

  // Ajuste manual do dono continua; token em branco mantém o antigo; o segredo nunca muda.
  fs.appendFileSync(path.join(dir, '.env'), "PLAYER=vlc\nTELEGRAM_BOT_TOKEN=abc\n");
  salvarConfiguracao(dir, { modo: 'producao', senha: "outra senha com ' e `", porta: 3100, token: '' });
  ({ env } = readSettings(dir, {}));
  assert.equal(env.PLAYER, 'vlc');
  assert.equal(env.TELEGRAM_BOT_TOKEN, 'abc');
  assert.equal(env.MERCADOPAGO_ACCESS_TOKEN, 'APP_USR-ficticio');
  assert.equal(env.ADMIN_SECRET, segredo);
  assert.equal(env.ADMIN_PASSWORD, "outra senha com ' e `");

  // Trocar de modo ajusta rede, provedor e player juntos.
  salvarConfiguracao(dir, { modo: 'teste', senha: 'senha-bem-forte', porta: 3100 });
  ({ env, test } = readSettings(dir, {}));
  assert.equal(test, true);
  assert.equal(env.PLAYER, 'sim');
  assert.equal(env.PAYMENT_PROVIDER, 'mock');
  assert.throws(() => salvarConfiguracao(dir, { modo: 'teste', senha: 'quebra\nde linha!!', porta: 3100 }), /quebra de linha/);
  assert.equal(readSettings(dir, {}).env.ADMIN_PASSWORD, 'senha-bem-forte', 'erro não estraga o arquivo');
});

test('atualizarEnv troca só as chaves pedidas e remove repetidas que valeriam por cima', () => {
  const texto = '# comentário\nA=1\nB=2\nA=3\n';
  assert.equal(atualizarEnv(texto, { A: 'novo', C: 'x y' }), "# comentário\nA=novo\nB=2\nC='x y'\n");
});

test('ferramentas do instalador viram caminhos, mas o .env do dono vale mais', (t) => {
  const dir = directory(t);
  const pasta = path.join(dir, 'pacote');
  const dados = path.join(dir, 'dados');
  fs.mkdirSync(path.join(pasta, 'mpv'), { recursive: true });
  for (const nome of ['mpv/mpv', 'ffmpeg', 'yt-dlp']) fs.writeFileSync(path.join(pasta, nome), 'x');
  const achadas = ferramentasEmbutidas(pasta, dados, 'linux');
  assert.equal(achadas.MPV_PATH, path.join(pasta, 'mpv', 'mpv'));
  assert.equal(achadas.FFMPEG_PATH, path.join(pasta, 'ffmpeg'));
  // O yt-dlp roda de uma cópia na pasta de dados, para conseguir se atualizar.
  assert.equal(achadas.YTDLP_PATH, path.join(dados, 'ferramentas', 'yt-dlp'));
  assert.ok(fs.existsSync(achadas.YTDLP_PATH));
  fs.writeFileSync(achadas.YTDLP_PATH, 'atualizado pelo -U');
  ferramentasEmbutidas(pasta, dados, 'linux');
  assert.equal(fs.readFileSync(achadas.YTDLP_PATH, 'utf8'), 'atualizado pelo -U', 'não desfaz a atualização');
  assert.deepEqual(ferramentasEmbutidas(path.join(dir, 'vazio'), dados, 'linux'), {});

  createSettings(dados, 'teste');
  fs.appendFileSync(path.join(dados, '.env'), 'FFMPEG_PATH=/meu/ffmpeg\nMPV_PATH=\n');
  const { env } = readSettings(dados, {}, achadas);
  assert.equal(env.FFMPEG_PATH, '/meu/ffmpeg');
  assert.equal(env.MPV_PATH, achadas.MPV_PATH);
  assert.equal(env.YTDLP_PATH, achadas.YTDLP_PATH);
});

test('maquininha e noteiro escolhidos na tela vão para o .env, e vazio desliga', (t) => {
  const dir = directory(t);
  salvarConfiguracao(dir, { modo: 'producao', senha: 'senha-bem-forte', porta: 3000, token: 'APP_USR-x', terminal: 'NEWLAND_N950__N950NCB801', noteiroPorta: 'COM3' });
  let { env } = readSettings(dir, {});
  assert.equal(env.MERCADOPAGO_POINT_TERMINAL, 'NEWLAND_N950__N950NCB801');
  assert.equal(env.NOTEIRO, 'serial');
  assert.equal(env.NOTEIRO_PORTA, 'COM3');
  assert.deepEqual([lerConfiguracao(dir).terminal, lerConfiguracao(dir).noteiroPorta], ['NEWLAND_N950__N950NCB801', 'COM3']);
  salvarConfiguracao(dir, { modo: 'producao', senha: 'senha-bem-forte', porta: 3000 });
  ({ env } = readSettings(dir, {}));
  assert.equal(env.NOTEIRO, 'desligado');
  assert.equal(env.MERCADOPAGO_POINT_TERMINAL, '');
  assert.throws(() => salvarConfiguracao(dir, { modo: 'producao', senha: 'senha-bem-forte', porta: 3000, terminal: 'com espaço' }), /Maquininha/);
});
