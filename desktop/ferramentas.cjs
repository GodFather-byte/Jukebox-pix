const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Ferramentas que o instalador traz (scripts/baixar-ferramentas.mjs): o caminho delas vira MPV_PATH, FFMPEG_PATH e
// YTDLP_PATH, a menos que o .env já aponte outro programa. Sem elas, vale o que estiver instalado no sistema.
function ferramentasEmbutidas(pasta, dataDir, plataforma = process.platform) {
  const exe = (nome) => (plataforma === 'win32' ? `${nome}.exe` : nome);
  const env = {};
  const mpv = path.join(pasta, 'mpv', exe('mpv'));
  if (fs.existsSync(mpv)) env.MPV_PATH = mpv;
  const ffmpeg = path.join(pasta, exe('ffmpeg'));
  if (fs.existsSync(ffmpeg)) env.FFMPEG_PATH = ffmpeg;
  const ytdlp = path.join(pasta, exe('yt-dlp'));
  if (fs.existsSync(ytdlp)) env.YTDLP_PATH = copiaGravavel(ytdlp, path.join(dataDir, 'ferramentas'));
  return env;
}

// O yt-dlp se atualiza sozinho (painel, aba Internet), e a pasta do programa pode não aceitar gravação: roda uma cópia
// na pasta de dados. Versão nova do aplicativo traz um yt-dlp novo e substitui a cópia.
function copiaGravavel(origem, pasta) {
  const destino = path.join(pasta, path.basename(origem));
  const marca = path.join(pasta, `${path.basename(origem)}.origem`);
  const { size, mtimeMs } = fs.statSync(origem);
  const assinatura = `${size}:${Math.round(mtimeMs)}`;
  try {
    if (fs.existsSync(destino) && fs.readFileSync(marca, 'utf8') === assinatura) return destino;
  } catch { /* sem marca: copia de novo */ }
  try {
    fs.mkdirSync(pasta, { recursive: true, mode: 0o700 });
    fs.copyFileSync(origem, destino);
    fs.chmodSync(destino, 0o755);
    fs.writeFileSync(marca, assinatura);
    return destino;
  } catch {
    return origem; // pasta de dados sem espaço ou bloqueada: usa a do instalador mesmo, sem atualização
  }
}

function funciona(comando, argumento) {
  if (!comando) return false;
  const r = spawnSync(comando, [argumento], { stdio: 'ignore', timeout: 5000, windowsHide: true });
  return !r.error && r.status === 0;
}

const VLC_WINDOWS = ['C:\\Program Files\\VideoLAN\\VLC\\vlc.exe', 'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe'];

// Situação mostrada na tela de configuração: o que vai tocar e o que está faltando.
function situacaoFerramentas(env, plataforma = process.platform) {
  const mpv = funciona(env.MPV_PATH || 'mpv', '--version');
  const vlc = !mpv && (Boolean(env.VLC_PATH && fs.existsSync(env.VLC_PATH)) || funciona('vlc', '--version')
    || (plataforma === 'win32' && VLC_WINDOWS.some((c) => fs.existsSync(c))));
  return {
    player: mpv ? 'mpv' : vlc ? 'vlc' : null,
    ffmpeg: funciona(env.FFMPEG_PATH || 'ffmpeg', '-version'),
    ytdlp: funciona(env.YTDLP_PATH || 'yt-dlp', '--version'),
  };
}

module.exports = { ferramentasEmbutidas, situacaoFerramentas };
