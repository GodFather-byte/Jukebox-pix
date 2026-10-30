import { spawnSync } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

let contador = 0;

// Canal de controle do mpv: named pipe no Windows, socket Unix nos demais sistemas.
export function novoCaminhoIpc() {
  contador += 1;
  const nome = `jukebox-mpv-${process.pid}-${contador}`;
  return process.platform === 'win32' ? `\\\\.\\pipe\\${nome}` : path.join(os.tmpdir(), `${nome}.sock`);
}

// Manda um comando JSON ao mpv em execução. Devolve true/false (nunca lança): se o canal sumiu,
// o volume novo vale a partir da próxima faixa.
export function enviarComando(caminho, comando, { tempoMs = 1500 } = {}) {
  return new Promise((resolve) => {
    const socket = net.connect(caminho);
    const encerrar = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(tempoMs, () => encerrar(false));
    socket.once('error', () => encerrar(false));
    socket.once('connect', () => {
      socket.write(`${JSON.stringify({ command: comando })}\n`, () => setTimeout(() => encerrar(true), 50));
    });
  });
}

export const definirVolumeMpv = (caminho, volume) => enviarComando(caminho, ['set_property', 'volume', volume]);

// mpv muito antigo não conhece --input-ipc-server e sairia com erro: confere antes de usar.
export function mpvSuportaIpc(comando) {
  const r = spawnSync(comando, ['--list-options'], { encoding: 'utf8', timeout: 5000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  return !r.error && r.status === 0 && String(r.stdout).includes('--input-ipc-server');
}

// `ganho` (dB) é o ajuste do volume parelho desta faixa; fica num filtro à parte para o volume mestre
// (que o painel muda ao vivo) continuar valendo por cima.
// duracao (segundos): para depois desse tempo, como a palhinha da aleatória. 0 = a música inteira.
export function argumentosMpv(arquivo, { volume = 100, ipc = null, ganho = 0, duracao = 0 } = {}) {
  return [
    '--no-video', '--no-terminal', '--really-quiet', '--audio-display=no',
    `--volume=${volume}`,
    ...(duracao > 0 ? [`--length=${duracao}`] : []),
    ...(ganho ? [`--af=lavfi=[volume=${ganho}dB]`] : []),
    ...(ipc ? [`--input-ipc-server=${ipc}`] : []),
    arquivo,
  ];
}

// O VLC (interface "dummy") não aceita comando em execução: o volume vale a partir da próxima faixa.
// O ganho em dB vira fator linear junto com o volume mestre (o --gain do VLC vai de 0 a 8).
export function argumentosVlc(arquivo, { volume = 100, ganho = 0, duracao = 0 } = {}) {
  const linear = Math.min(8, (volume / 100) * 10 ** (ganho / 20));
  return ['--intf', 'dummy', '--no-video', '--play-and-exit', '--quiet', `--gain=${linear.toFixed(2)}`,
    ...(duracao > 0 ? [`--stop-time=${duracao}`] : []), arquivo];
}
