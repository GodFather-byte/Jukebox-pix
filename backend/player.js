import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { argumentosMpv, argumentosVlc, definirVolumeMpv, mpvSuportaIpc, novoCaminhoIpc } from './audio.js';
import { config } from './config.js';
import { SESSAO_SISTEMA } from './database.js';
import { emitirSessao, emitirTodos } from './events.js';
import * as configuracoes from './services/configuracoes.js';
import * as fila from './services/fila.js';
import { obterSessao } from './services/sessoes.js';

const RECENTES_MAX = 15; // não repete uma aleatória tocada nas últimas 15 faixas
const PAUSA_APOS_FALHA_AUTOMATICA_MS = 5000; // evita laço rápido se os arquivos do acervo sumirem

let backend = null;
let atual = null; // { item, proc, timer, pulada, automatica }
let pausado = false;
let intervalo = null;
let recentes = [];
let automaticoLivreEm = 0;

function comandoExiste(comando) {
  const r = spawnSync(comando, ['--version'], { stdio: 'ignore', timeout: 5000, windowsHide: true });
  return !r.error && r.status === 0;
}

function localizarVlc() {
  const candidatos = [
    config.player.vlc,
    'vlc',
    'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
    'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
    '/Applications/VLC.app/Contents/MacOS/VLC',
  ].filter(Boolean);
  return candidatos.find((c) => (path.isAbsolute(c) ? fs.existsSync(c) : comandoExiste(c)));
}

function escolherBackend() {
  const { tipo } = config.player;
  if (tipo === 'sim') return { tipo: 'sim' };

  if (tipo === 'auto' || tipo === 'mpv') {
    if (comandoExiste(config.player.mpv)) {
      const comando = config.player.mpv;
      return { tipo: 'mpv', comando, ipc: mpvSuportaIpc(comando) };
    }
  }
  if (tipo === 'auto' || tipo === 'vlc') {
    const vlc = localizarVlc();
    if (vlc) return { tipo: 'vlc', comando: vlc };
  }

  // Em produção, simular a reprodução cobraria o cliente por uma música muda.
  if (config.producao || tipo !== 'auto') {
    throw new Error(`Player "${tipo}" não encontrado. Instale o mpv (https://mpv.io) ou o VLC, ou ajuste MPV_PATH/VLC_PATH.`);
  }
  console.warn('[player] mpv/VLC não encontrados: usando player SIMULADO (nenhum áudio será tocado).');
  return { tipo: 'sim' };
}

function argumentos(arquivo, ipc) {
  const volume = configuracoes.lerVolume();
  return backend.tipo === 'mpv' ? argumentosMpv(arquivo, { volume, ipc }) : argumentosVlc(arquivo, { volume });
}

// Só toca arquivos dentro da pasta de músicas (o caminho vem do banco).
function resolverArquivo(relativo) {
  const absoluto = path.resolve(config.musicasDir, relativo);
  return absoluto.startsWith(config.musicasDir + path.sep) ? absoluto : null;
}

const avisarFila = () => emitirTodos('fila');

function tick() {
  if (atual || pausado) return;

  let item = fila.proximo();
  // Fila vazia: se o modo automático estiver ligado, sorteia uma música pra não deixar o salão em silêncio.
  if (!item && Date.now() >= automaticoLivreEm && configuracoes.automaticoAtivo()) {
    item = fila.criarAutomatico(recentes, configuracoes.categoriasDaAutomatica());
  }
  if (item) tocar(item);
}

function tocar(item) {
  const simulado = backend.tipo === 'sim';
  const segundos = simulado
    ? Math.min(item.duracao ?? config.player.simSegundos, config.player.simSegundos)
    : (item.duracao ?? 180);

  recentes = [...recentes, item.musica_id].slice(-RECENTES_MAX);
  fila.marcarTocando(item.id, new Date(Date.now() + segundos * 1000).toISOString());
  atual = { item, proc: null, timer: null, pulada: false, automatica: item.session_id === SESSAO_SISTEMA };
  avisarFila();

  if (simulado) {
    atual.timer = setTimeout(() => terminar(item, true), segundos * 1000);
    return;
  }

  const arquivo = resolverArquivo(item.arquivo);
  if (!arquivo || !fs.existsSync(arquivo)) {
    console.error(`[player] arquivo não encontrado: ${item.arquivo}`);
    terminar(item, false);
    return;
  }

  // O mpv recebe um canal de controle pra o admin mudar o volume com a música tocando.
  atual.ipc = backend.tipo === 'mpv' && backend.ipc ? novoCaminhoIpc() : null;
  const proc = spawn(backend.comando, argumentos(arquivo, atual.ipc), { stdio: 'ignore', windowsHide: true });
  atual.proc = proc;
  let encerrado = false;
  const fim = (ok) => {
    if (encerrado) return;
    encerrado = true;
    terminar(item, ok);
  };
  proc.once('error', (erro) => {
    console.error(`[player] falha ao iniciar ${backend.comando}: ${erro.message}`);
    fim(false);
  });
  proc.once('exit', (codigo) => fim(codigo === 0 || Boolean(atual?.pulada)));
}

function terminar(item, sucesso) {
  clearTimeout(atual?.timer);
  const automatica = atual?.automatica;
  atual = null;

  if (sucesso) {
    fila.concluir(item);
  } else {
    fila.falhar(item);
    if (automatica) automaticoLivreEm = Date.now() + PAUSA_APOS_FALHA_AUTOMATICA_MS;
    else emitirSessao(item.session_id, 'sessao', obterSessao(item.session_id));
  }

  avisarFila();
  emitirTodos('top');
  setImmediate(tick);
}

export function iniciar() {
  backend = escolherBackend();
  fila.recuperarTocando();
  intervalo = setInterval(tick, 2000);
  tick();
  return backend.tipo;
}

export function parar() {
  clearInterval(intervalo);
  clearTimeout(atual?.timer);
  atual?.proc?.kill();
}

// Aplica o volume gravado à música em andamento (só o mpv aceita mudança ao vivo; o resto vale na próxima faixa).
export async function aplicarVolume() {
  if (!atual?.ipc) return false;
  return definirVolumeMpv(atual.ipc, configuracoes.lerVolume());
}

// Chamado quando alguém entra na fila. Se está tocando uma aleatória e o dono pediu pra cortá-la,
// pula agora; senão o pedido toca assim que a faixa atual terminar.
export function acordar() {
  if (atual?.automatica && configuracoes.automaticoInterrompe()) {
    pular();
    return;
  }
  setImmediate(tick);
}

// Pular conta como tocada (o cliente pagou e a música começou); remover da fila é que reembolsa.
export function pular() {
  if (!atual) return false;
  if (!atual.proc) {
    terminar(atual.item, true);
  } else {
    atual.pulada = true;
    atual.proc.kill();
  }
  return true;
}

export function pausar() {
  pausado = true;
}

export function retomar() {
  pausado = false;
  tick();
}

export const estado = () => ({
  backend: backend?.tipo ?? null,
  pausado,
  tocando: Boolean(atual),
  automatico: configuracoes.lerAutomatico(),
  volume: configuracoes.lerVolume(),
  volume_ao_vivo: Boolean(backend?.ipc),
});
