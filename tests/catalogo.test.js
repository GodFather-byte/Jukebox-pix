import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ambiente = (extras = {}) => {
  const env = { ...process.env };
  for (const nome of ['JUKEBOX_DATA_DIR', 'DB_PATH', 'MUSICAS_DIR', 'IMPORT_DIR', 'BACKUP_DIR', 'BACKUP_COPIA_DIR', 'PUBLIC_URL']) delete env[nome];
  return { ...env, DOTENV_CONFIG_PATH: path.join(raiz, 'tests', '.env-inexistente'), DOTENV_CONFIG_QUIET: 'true', ...extras };
};

const executar = (codigo, env = {}) => spawnSync(process.execPath, ['--input-type=module', '-e', codigo], {
  cwd: raiz, env: ambiente(env), encoding: 'utf8', timeout: 20_000,
});

const pastaDeDados = (t) => {
  const pasta = path.join(raiz, 'tests', `.catalogo-data-${randomUUID()}`);
  fs.mkdirSync(pasta, { recursive: true });
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  return pasta;
};

test('busca prioriza título e artista e não trata % como coringa', (t) => {
  const resultado = executar(`
    import { db } from './backend/database.js';
    import { buscar, porIds } from './backend/services/catalogo.js';

    const agora = new Date().toISOString();
    const run = (sql, ...p) => db.prepare(sql).run(...p);
    run('INSERT INTO categorias (id, nome, icone, cor) VALUES (?, ?, ?, ?)', 'sert', 'Sertanejo', '🤠', '#F5B700');
    run('INSERT INTO categorias (id, nome, icone, cor) VALUES (?, ?, ?, ?)', 'funk', 'Funk', '🎤', '#FF1493');
    run('INSERT INTO artistas (id, nome, categoria_id, criado_em) VALUES (?, ?, ?, ?)', 'chi', 'Chitãozinho', 'sert', agora);
    run('INSERT INTO artistas (id, nome, categoria_id, criado_em) VALUES (?, ?, ?, ?)', 'out', 'Outro Nome', 'sert', agora);
    run('INSERT INTO artistas (id, nome, categoria_id, criado_em) VALUES (?, ?, ?, ?)', 'mc', 'MC Neon', 'funk', agora);
    const cd = (id, titulo, artista, categoria, oculto = 0) => run(
      'INSERT INTO cds (id, titulo, artista_id, categoria_id, status, oculto, data_criacao, data_lancamento, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, titulo, artista, categoria, 'lancado', oculto, agora, agora, agora,
    );
    cd('cd-exato', 'Coletânea', 'chi', 'sert');
    cd('cd-nome', 'Evidências', 'out', 'sert');
    cd('cd-funk', 'Baile', 'mc', 'funk');
    cd('cd-oculto', 'Some', 'chi', 'sert', 1);
    const musica = (id, titulo, cdId, vezes, oculta = 0) => run(
      'INSERT INTO musicas (id, titulo, cd_id, duracao, creditos, arquivo, oculta, vezes_tocada, criado_em) VALUES (?, ?, ?, 180, 1, ?, ?, ?, ?)',
      id, titulo, cdId, id + '.mp3', oculta, vezes, agora,
    );
    musica('exata', 'Evidências', 'cd-exato', 1);
    musica('contem', 'Noite de Evidências', 'cd-exato', 400);
    musica('so-cd', 'Abertura', 'cd-nome', 900);
    musica('hit', 'Modão Estourado', 'cd-exato', 5000);
    musica('funk', 'Evidências do Baile', 'cd-funk', 50);
    musica('escondida', 'Evidências', 'cd-exato', 9999, 1);
    musica('cd-sumido', 'Faixa Sumida', 'cd-oculto', 0);

    const titulos = (termo, opcoes) => buscar(termo, opcoes?.categoria, opcoes).map((m) => m.id);
    console.log(JSON.stringify({
      evidencias: titulos('evidencias'),
      artista: titulos('chitaozinho'),
      frase: titulos('chitaozinho evidencias'),
      categoria: titulos('evidencias', { categoria: 'funk' }),
      coringa: titulos('100%'),
      porcento: (() => {
        musica('porcento', '100% Amor', 'cd-exato', 3);
        musica('amor', 'Amor Total', 'cd-exato', 80);
        return titulos('100%');
      })(),
      ocultas: titulos('evidencias', { incluirOcultas: true }),
      porIds: porIds(['funk', 'exata', 'escondida', 'cd-sumido', 'inexistente', 'exata']).map((m) => m.id),
      curto: titulos('e'),
    }));
    db.close();
  `, { JUKEBOX_DATA_DIR: pastaDeDados(t), NODE_ENV: 'test' });

  assert.equal(resultado.status, 0, resultado.stderr || resultado.stdout);
  const dados = JSON.parse(resultado.stdout);
  assert.deepEqual(dados.evidencias, ['exata', 'funk', 'contem', 'so-cd']);
  assert.deepEqual(dados.artista, ['hit', 'contem', 'exata']);
  assert.deepEqual(dados.frase, ['exata', 'contem']);
  assert.deepEqual(dados.categoria, ['funk']);
  assert.deepEqual(dados.coringa, []);
  assert.deepEqual(dados.porcento, ['porcento']);
  assert.equal(dados.ocultas.includes('escondida'), true);
  assert.equal(dados.ocultas.includes('cd-sumido'), false);
  assert.equal(dados.ocultas[0], 'escondida');
  assert.deepEqual(dados.porIds, ['funk', 'exata']);
  assert.deepEqual(dados.curto, []);
});
