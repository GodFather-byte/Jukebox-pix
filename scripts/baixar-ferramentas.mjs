// Baixa as ferramentas que vão dentro do instalador (pasta ferramentas/<win|linux>), para o dono instalar e já tocar:
//   Windows: mpv (player), ffmpeg (volume parelho) e yt-dlp (músicas da internet).
//   Linux:   ffmpeg e yt-dlp. O mpv vem do sistema: o pacote .deb já depende dele.
// Uso: node scripts/baixar-ferramentas.mjs [win|linux]  (padrão: o sistema atual)
// Roda no CI antes do electron-builder. yt-dlp e ffmpeg são conferidos pelo SHA-256 publicado junto.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const alvo = process.argv[2] || (process.platform === 'win32' ? 'win' : 'linux');
if (!['win', 'linux'].includes(alvo)) {
  console.error('Use: node scripts/baixar-ferramentas.mjs [win|linux]');
  process.exit(1);
}
const destino = path.join(raiz, 'ferramentas', alvo);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-ferramentas-'));

const YTDLP = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
const FFMPEG = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest';
const MPV_API = 'https://api.github.com/repos/shinchiro/mpv-winbuild-cmake/releases/latest';

async function baixar(url, arquivo, cabecalhos = {}) {
  const resposta = await fetch(url, { headers: { 'User-Agent': 'jukebox-pix-build', ...cabecalhos }, redirect: 'follow' });
  if (!resposta.ok) throw new Error(`Falha ao baixar ${url}: HTTP ${resposta.status}`);
  const dados = Buffer.from(await resposta.arrayBuffer());
  if (arquivo) fs.writeFileSync(arquivo, dados);
  return dados;
}

// Arquivo "hash  nome" (formato do sha256sum) -> confere o arquivo baixado.
async function conferir(urlSomas, nome, arquivo) {
  const somas = (await baixar(urlSomas)).toString('utf8');
  const linha = somas.split('\n').find((l) => l.trim().split(/\s+\*?/)[1] === nome);
  if (!linha) throw new Error(`SHA-256 de ${nome} não publicado em ${urlSomas}`);
  const esperado = linha.trim().split(/\s+/)[0].toLowerCase();
  const obtido = crypto.createHash('sha256').update(fs.readFileSync(arquivo)).digest('hex');
  if (obtido !== esperado) throw new Error(`SHA-256 de ${nome} não confere (baixado ${obtido}, esperado ${esperado})`);
}

function extrair(arquivo, pasta) {
  fs.mkdirSync(pasta, { recursive: true });
  // No Windows o runner do CI tem o 7-Zip; no Linux o tar abre .tar.xz.
  const [exe, args] = alvo === 'win' ? ['7z', ['x', '-y', `-o${pasta}`, arquivo]] : ['tar', ['-xJf', arquivo, '-C', pasta]];
  const r = spawnSync(exe, args, { stdio: 'ignore' });
  if (r.error || r.status !== 0) throw new Error(`Não foi possível extrair ${path.basename(arquivo)} com ${exe}`);
}

function procurar(pasta, nome) {
  for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
    const completo = path.join(pasta, item.name);
    if (item.isDirectory()) {
      const achado = procurar(completo, nome);
      if (achado) return achado;
    } else if (item.name === nome) return completo;
  }
  return null;
}

async function ytdlp() {
  const nome = alvo === 'win' ? 'yt-dlp.exe' : 'yt-dlp_linux';
  const arquivo = path.join(temp, nome);
  await baixar(`${YTDLP}/${nome}`, arquivo);
  await conferir(`${YTDLP}/SHA2-256SUMS`, nome, arquivo);
  const final = path.join(destino, alvo === 'win' ? 'yt-dlp.exe' : 'yt-dlp');
  fs.copyFileSync(arquivo, final);
  fs.chmodSync(final, 0o755);
  console.log('yt-dlp ok');
}

async function ffmpeg() {
  // Versão LGPL: tem o filtro loudnorm, que é o que o volume parelho usa.
  const nome = alvo === 'win' ? 'ffmpeg-master-latest-win64-lgpl.zip' : 'ffmpeg-master-latest-linux64-lgpl.tar.xz';
  const arquivo = path.join(temp, nome);
  await baixar(`${FFMPEG}/${nome}`, arquivo);
  await conferir(`${FFMPEG}/checksums.sha256`, nome, arquivo);
  const pasta = path.join(temp, 'ffmpeg');
  extrair(arquivo, pasta);
  const exe = alvo === 'win' ? 'ffmpeg.exe' : 'ffmpeg';
  const achado = procurar(pasta, exe);
  if (!achado) throw new Error('ffmpeg não encontrado no pacote baixado');
  fs.copyFileSync(achado, path.join(destino, exe));
  fs.chmodSync(path.join(destino, exe), 0o755);
  const licenca = procurar(pasta, 'LICENSE.txt');
  if (licenca) fs.copyFileSync(licenca, path.join(destino, 'LICENCA-ffmpeg.txt'));
  console.log('ffmpeg ok');
}

async function mpv() {
  const cabecalhos = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) cabecalhos.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const release = JSON.parse((await baixar(MPV_API, null, cabecalhos)).toString('utf8'));
  // Build x86_64 comum (a "v3" exige processador mais novo; o notebook da casa pode ser antigo).
  const pacote = (release.assets || []).find((a) => /^mpv-x86_64-\d{8}-git-[0-9a-f]+\.7z$/.test(a.name));
  if (!pacote) throw new Error('Pacote do mpv para Windows x86_64 não encontrado na última release');
  const arquivo = path.join(temp, pacote.name);
  await baixar(pacote.browser_download_url, arquivo);
  const pasta = path.join(destino, 'mpv');
  extrair(arquivo, pasta);
  if (!fs.existsSync(path.join(pasta, 'mpv.exe'))) throw new Error('mpv.exe não encontrado no pacote baixado');
  console.log(`mpv ok (${pacote.name})`);
}

try {
  fs.rmSync(destino, { recursive: true, force: true });
  fs.mkdirSync(destino, { recursive: true });
  await ytdlp();
  await ffmpeg();
  if (alvo === 'win') await mpv();
  fs.writeFileSync(path.join(destino, 'LEIA-ME.txt'), [
    'Ferramentas incluídas no Jukebox Pix, sem modificação:',
    '- yt-dlp (Unlicense): https://github.com/yt-dlp/yt-dlp',
    '- ffmpeg (LGPL, build BtbN): https://github.com/BtbN/FFmpeg-Builds (código-fonte: https://ffmpeg.org)',
    ...(alvo === 'win' ? ['- mpv (GPL/LGPL, build shinchiro): https://github.com/shinchiro/mpv-winbuild-cmake (código-fonte: https://mpv.io)'] : []),
    '',
  ].join('\n'));
} catch (erro) {
  console.error(erro.message);
  process.exitCode = 1;
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
