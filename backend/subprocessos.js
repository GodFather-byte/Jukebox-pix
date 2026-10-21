import { spawnSync } from 'node:child_process';

// Grupos próprios permitem encerrar também os filhos de yt-dlp, ffmpeg e players no Unix.
export const opcoesSubprocesso = { detached: process.platform !== 'win32', windowsHide: true };

export function encerrarArvore(proc) {
  if (!proc?.pid) return;
  if (process.platform === 'win32') {
    const resultado = spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], {
      stdio: 'ignore', windowsHide: true, timeout: 1500,
    });
    if (resultado.error || resultado.status !== 0) proc.kill();
    return;
  }
  try {
    process.kill(-proc.pid, 'SIGKILL');
  } catch {
    try { proc.kill('SIGKILL'); } catch { /* já encerrou */ }
  }
}
