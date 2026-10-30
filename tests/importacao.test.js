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
  const pasta = path.join(raiz, 'tests', `.importacao-data-${randomUUID()}`);
  fs.mkdirSync(pasta, { recursive: true });
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  return pasta;
};

const criar = (base, relativo) => {
  const arquivo = path.join(base, relativo);
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, '');
};

test('acervo de outra jukebox: pasta "ARTISTA - CD" vira artista e CD', (t) => {
  const dados = pastaDeDados(t);
  const entrada = path.join(dados, 'entrada');
  criar(entrada, 'Henrique e Juliano - Manifesto Musical/07 - A Maior Saudade.mp3');
  criar(entrada, 'Henrique e Juliano - Manifesto Musical/08 - Rasteira.mp3');
  criar(entrada, 'SIMONE E SIMARIA - 126 CABIDES - CD 1/01 - 126 CABIDES.mp3');
  criar(entrada, 'Coletanea Funk 4/01 - 300 No 7.MP3');
  criar(entrada, 'Victor & Léo - Ao Vivo em Floripa DVD1/01 - NÃO ME PERDOEI.mpg');
  criar(entrada, 'Rock/Legião Urbana/Dois/01 - Tempo Perdido.mp3');
  criar(entrada, 'solta.mp3');

  const resultado = executar(`
    import { escanear, separarArtista } from './backend/services/importacao.js';
    const { cds, ignorados } = escanear();
    console.log(JSON.stringify({
      cds: cds.map(({ chave, categoriaPasta, artista, titulo, audios }) => ({ chave, categoriaPasta, artista, titulo, audios })),
      ignorados,
      semTraco: separarArtista('Lucas e Luan'),
    }));
  `, { JUKEBOX_DATA_DIR: dados, IMPORT_DIR: entrada });

  assert.equal(resultado.status, 0, resultado.stderr);
  const { cds, ignorados, semTraco } = JSON.parse(resultado.stdout.trim().split('\n').at(-1));
  const porChave = Object.fromEntries(cds.map((cd) => [cd.chave, cd]));

  assert.deepEqual(porChave['Henrique e Juliano - Manifesto Musical'], {
    chave: 'Henrique e Juliano - Manifesto Musical', categoriaPasta: null, artista: 'Henrique e Juliano',
    titulo: 'Manifesto Musical', audios: ['07 - A Maior Saudade.mp3', '08 - Rasteira.mp3'],
  });
  assert.equal(porChave['SIMONE E SIMARIA - 126 CABIDES - CD 1'].artista, 'SIMONE E SIMARIA');
  assert.equal(porChave['SIMONE E SIMARIA - 126 CABIDES - CD 1'].titulo, '126 CABIDES - CD 1');
  assert.equal(porChave['Coletanea Funk 4'].artista, 'Coletanea Funk 4', 'extensão em maiúsculas também vale');
  assert.equal(porChave['Rock/Legião Urbana/Dois'].categoriaPasta, 'Rock', 'o formato antigo continua valendo');
  assert.deepEqual(semTraco, { artista: 'Lucas e Luan', nomeCd: 'Lucas e Luan' });

  assert.ok(ignorados.some((i) => i.chave === '(raiz da pasta)'));
  assert.ok(ignorados.some((i) => i.chave === 'Victor & Léo - Ao Vivo em Floripa DVD1' && /clipes/.test(i.motivo)));
  assert.equal(cds.length, 4);
});

test('importa o CD da pasta "ARTISTA - CD" com os títulos tirados do nome do arquivo', (t) => {
  const dados = pastaDeDados(t);
  const entrada = path.join(dados, 'entrada');
  criar(entrada, 'Henrique e Juliano - Manifesto Musical/08 - Rasteira.mp3');
  criar(entrada, 'Henrique e Juliano - Manifesto Musical/07 - A Maior Saudade.mp3');

  const resultado = executar(`
    import { db } from './backend/database.js';
    import { importar } from './backend/services/importacao.js';
    db.prepare('INSERT INTO categorias (id, nome, icone, cor) VALUES (?, ?, ?, ?)').run('sert', 'Sertanejo', '🤠', '#F5B700');
    const { importados, erros } = await importar({ chaves: ['Henrique e Juliano - Manifesto Musical'], categoriaId: 'sert', status: 'lancado' });
    const cd = db.prepare('SELECT cds.titulo, artistas.nome AS artista FROM cds JOIN artistas ON artistas.id = cds.artista_id').get();
    const faixas = db.prepare('SELECT titulo FROM musicas ORDER BY arquivo').all().map((m) => m.titulo);
    console.log(JSON.stringify({ importados: importados.length, erros, cd, faixas }));
  `, { JUKEBOX_DATA_DIR: dados, IMPORT_DIR: entrada });

  assert.equal(resultado.status, 0, resultado.stderr);
  const saida = JSON.parse(resultado.stdout.trim().split('\n').at(-1));
  assert.deepEqual(saida.erros, []);
  assert.equal(saida.importados, 1);
  assert.deepEqual(saida.cd, { titulo: 'Manifesto Musical', artista: 'Henrique e Juliano' });
  assert.deepEqual(saida.faixas, ['A Maior Saudade', 'Rasteira']);
});

test('acervo de outra jukebox: cadastra sem mover, copiar ou apagar nada do HD', (t) => {
  const dados = pastaDeDados(t);
  const hd = path.join(dados, 'hd-antigo', 'musicas');
  criar(hd, 'Henrique e Juliano - Manifesto Musical/07 - A Maior Saudade.mp3');
  criar(hd, 'Henrique e Juliano - Manifesto Musical/capa.jpg');
  const antes = fs.readdirSync(path.join(hd, 'Henrique e Juliano - Manifesto Musical')).sort();

  const resultado = executar(`
    import path from 'node:path';
    import { db } from './backend/database.js';
    import { config } from './backend/config.js';
    import { importar, listar } from './backend/services/importacao.js';
    db.prepare('INSERT INTO categorias (id, nome, icone, cor) VALUES (?, ?, ?, ?)').run('sert', 'Sertanejo', '🤠', '#F5B700');
    const lista = listar('externo');
    const r = await importar({ chaves: ['Henrique e Juliano - Manifesto Musical'], categoriaId: 'sert', status: 'lancado', origem: 'externo' });
    const musica = db.prepare('SELECT arquivo FROM musicas').get();
    const cd = db.prepare('SELECT capa FROM cds').get();
    console.log(JSON.stringify({
      origem: lista.origem, cds: lista.cds.length, erros: r.erros,
      arquivo: musica.arquivo, capaCopiada: path.join(config.musicasDir, 'capas', cd.capa),
    }));
  `, { JUKEBOX_DATA_DIR: dados, ACERVO_EXTERNO_DIR: hd });

  assert.equal(resultado.status, 0, resultado.stderr);
  const saida = JSON.parse(resultado.stdout.trim().split('\n').at(-1));
  assert.equal(saida.origem, 'externo');
  assert.equal(saida.cds, 1);
  assert.deepEqual(saida.erros, []);
  assert.equal(path.resolve(saida.arquivo), path.join(hd, 'Henrique e Juliano - Manifesto Musical', '07 - A Maior Saudade.mp3'),
    'a música toca de onde está');
  assert.ok(fs.existsSync(saida.capaCopiada), 'a capa é copiada para a biblioteca');
  assert.deepEqual(fs.readdirSync(path.join(hd, 'Henrique e Juliano - Manifesto Musical')).sort(), antes, 'o HD fica intacto');
});

test('acervo de outra jukebox sem pasta configurada ou com o HD desligado avisa o dono', (t) => {
  const dados = pastaDeDados(t);
  const codigo = `
    import { listar } from './backend/services/importacao.js';
    try { listar('externo'); } catch (e) { console.log(e.message); }
  `;
  const sem = executar(codigo, { JUKEBOX_DATA_DIR: dados });
  assert.match(sem.stdout, /Nenhuma pasta de acervo/);
  const desligado = executar(codigo, { JUKEBOX_DATA_DIR: dados, ACERVO_EXTERNO_DIR: path.join(dados, 'nao-existe') });
  assert.match(desligado.stdout, /HD está ligado/);
});
