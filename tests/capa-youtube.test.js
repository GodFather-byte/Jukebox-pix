import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const falso = path.join(raiz, 'tests', 'yt-dlp-falso.js');
const VIDEO = 'abcdefghijk';

const ambiente = (extras = {}) => {
  const env = { ...process.env };
  for (const nome of ['JUKEBOX_DATA_DIR', 'DB_PATH', 'MUSICAS_DIR', 'IMPORT_DIR', 'BACKUP_DIR', 'BACKUP_COPIA_DIR', 'PUBLIC_URL', 'YTDLP_PATH', 'CAPA_RUIM', 'JUKEBOX_CAPA_HTTP']) delete env[nome];
  return {
    ...env,
    DOTENV_CONFIG_PATH: path.join(raiz, 'tests', '.env-inexistente'),
    DOTENV_CONFIG_QUIET: 'true',
    JUKEBOX_CAPA_HTTP: '0',
    YTDLP_PATH: falso,
    ...extras,
  };
};

const pastaDeDados = (t) => {
  const pasta = path.join(raiz, 'tests', `.capa-data-${randomUUID()}`);
  fs.mkdirSync(pasta, { recursive: true });
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  return pasta;
};

const rodar = (t, extras = {}) => {
  const resultado = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import fs from 'node:fs';
    import path from 'node:path';
    import { db } from './backend/database.js';
    import { config } from './backend/config.js';
    import { iniciar, parar } from './backend/player.js';
    import { salvarYoutube } from './backend/services/configuracoes.js';
    import { creditar, criarSessao, obterSessao } from './backend/services/sessoes.js';
    import { obterMusica } from './backend/services/catalogo.js';
    import { listar } from './backend/services/fila.js';
    import { comprar } from './backend/services/sobdemanda.js';
    import { baixarCapa, encerrarTudo, extensaoDeImagem, verificar } from './backend/services/youtube.js';

    const video = ${JSON.stringify(VIDEO)};
    const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCfAAH/2Q==', 'base64');
    iniciar();
    try {
      const recusadas = await Promise.all(['../etc/passwd', 'curto', '', null].map((id) => baixarCapa(id)));
      salvarYoutube({ ativo: true, aceite: true, preco: 1, max_min: 8 });
      const situacao = await verificar();
      const sessao = criarSessao();
      creditar(sessao.id, 5, 0);
      await comprar(sessao.id, video, '127.0.0.1');

      let pedido = null;
      for (let i = 0; i < 50 && pedido?.status !== 'na_fila' && pedido?.status !== 'falhou'; i += 1) {
        pedido = db.prepare('SELECT status, erro FROM pedidos_youtube WHERE video_id = ?').get(video);
        if (pedido?.status === 'na_fila' || pedido?.status === 'falhou') break;
        await new Promise((resolver) => setTimeout(resolver, 100));
      }

      const musica = db.prepare('SELECT id, capa, arquivo, titulo FROM musicas WHERE youtube_id = ?').get(video);
      const fila = listar(sessao.id);
      const item = fila.agora_tocando ?? fila.fila[0] ?? null;
      db.prepare("UPDATE cds SET capa = 'album.jpg' WHERE id = 'sob-demanda'").run();
      const comCapaPropria = musica ? obterMusica(musica.id) : null;
      if (musica?.capa) db.prepare('UPDATE musicas SET capa = NULL WHERE id = ?').run(musica.id);
      const soDoCd = musica ? obterMusica(musica.id)?.capa : null;
      const nomesAudio = fs.existsSync(config.youtube.pasta) ? fs.readdirSync(config.youtube.pasta) : [];
      const capas = path.join(config.musicasDir, 'capas');
      const nomesCapa = fs.existsSync(capas) ? fs.readdirSync(capas) : [];

      console.log(JSON.stringify({
        extensao: extensaoDeImagem(jpeg),
        texto: extensaoDeImagem(Buffer.from('x'.repeat(200))),
        recusadas,
        ytdlp: situacao.ok,
        pedido,
        saldo: obterSessao(sessao.id).saldo,
        musica,
        filaCapa: item?.musica.capa ?? null,
        comCapaPropria: comCapaPropria?.capa ?? null,
        soDoCd,
        nomesAudio,
        nomesCapa,
      }));
    } finally {
      parar();
      encerrarTudo();
      db.close();
    }
  `], {
    cwd: raiz,
    env: ambiente({ JUKEBOX_DATA_DIR: pastaDeDados(t), NODE_ENV: 'test', PLAYER: 'sim', ...extras }),
    encoding: 'utf8',
    timeout: 40_000,
  });
  assert.equal(resultado.status, 0, `${resultado.stderr}\n${resultado.stdout}`);
  const linha = resultado.stdout.trim().split('\n').filter(Boolean).pop();
  return JSON.parse(linha);
};

test('baixa a capa junto com o áudio e a faixa usa a capa dela', { timeout: 45_000 }, (t) => {
  const dados = rodar(t);
  assert.equal(dados.extensao, '.jpg');
  assert.equal(dados.texto, null);
  assert.deepEqual(dados.recusadas, [null, null, null, null]);
  assert.equal(dados.ytdlp, true);
  assert.equal(dados.pedido?.status, 'na_fila', dados.pedido?.erro);
  assert.equal(dados.saldo, 4);
  assert.equal(dados.musica.capa, `yt-${VIDEO}.png`);
  assert.equal(dados.musica.arquivo, `SobDemanda/${VIDEO}.wav`);
  assert.equal(dados.filaCapa, `yt-${VIDEO}.png`);
  assert.equal(dados.comCapaPropria, `yt-${VIDEO}.png`);
  assert.equal(dados.soDoCd, 'album.jpg');
  assert.deepEqual(dados.nomesAudio, [`${VIDEO}.wav`]);
  assert.ok(dados.nomesCapa.includes(`yt-${VIDEO}.png`));
  assert.equal(dados.nomesCapa.some((nome) => nome.startsWith('.tmp-')), false);
});

test('capa inválida não devolve o crédito nem apaga o áudio', { timeout: 45_000 }, (t) => {
  const dados = rodar(t, { CAPA_RUIM: '1' });
  assert.equal(dados.pedido?.status, 'na_fila', dados.pedido?.erro);
  assert.equal(dados.saldo, 4);
  assert.equal(dados.musica.capa, null);
  assert.equal(dados.filaCapa, null);
  assert.equal(dados.musica.arquivo, `SobDemanda/${VIDEO}.wav`);
  assert.deepEqual(dados.nomesAudio, [`${VIDEO}.wav`]);
  assert.equal(dados.nomesCapa.some((nome) => nome.startsWith('yt-')), false);
  assert.equal(dados.nomesCapa.some((nome) => nome.startsWith('.tmp-')), false);
});
