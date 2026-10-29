import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { argumentosMpv, argumentosVlc, definirVolumeMpv, mpvSuportaIpc, novoCaminhoIpc } from './audio.js';
import { config } from './config.js';
import { encerrarArvore, opcoesSubprocesso } from './subprocessos.js';
import { SESSAO_SISTEMA } from './database.js';
import { emitirSessao, emitirTodos } from './events.js';
import { avisar } from './services/alertas.js';
import * as configuracoes from './services/configuracoes.js';
import * as fila from './services/fila.js';
import { obterSessao } from './services/sessoes.js';
import * as vinhetas from './services/vinhetas.js';
import * as volumeParelho from './services/volume.js';

const RECENTES_MAX = 15; // não repete uma aleatória tocada nas últimas 15 faixas
const PAUSA_APOS_FALHA_AUTOMATICA_MS = 5000; // evita laço rápido se os arquivos do acervo sumirem
// Uma música de verdade nunca acaba em menos que isso. O VLC sai com código 0 até quando não consegue abrir o
// arquivo (corrompido, formato estranho), e isso não pode contar como "tocou" (o cliente pagou e ficaria sem reembolso).
const TEMPO_MINIMO_MS = 1500;
const FALHAS_PARA_AVISAR = 3; // falhas seguidas até avisar o dono no Telegram

let backend = null;
let atual = null; // { item, proc, timer, pulada, automatica } ou { vinheta: true, proc, timer, pulada }
let pausado = false;
let intervalo = null;
let recentes = [];
let automaticoLivreEm = 0;
let silencioDesde = Date.now(); // quando a última música acabou (ou o player ligou)
let chamadaFeita = false; // a vinheta de chamada já tocou antes da próxima aleatória
let desdeVinheta = 0; // músicas tocadas desde a última vinheta
let falhasSeguidas = 0;
let encerrando = false;

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
  console.warn('[player] Para ouvir de verdade, instale o VLC (winget install VideoLAN.VLC) e reinicie o servidor.');
  return { tipo: 'sim' };
}

// A aleatória toca mais baixo que a música paga (configurável no painel): quem quer a dele no volume cheio, paga.
const volumeDe = (automatica) => (automatica
  ? Math.round((configuracoes.lerVolume() * configuracoes.automaticoVolume()) / 100)
  : configuracoes.lerVolume());

function argumentos(arquivo, ipc, ganho = 0, automatica = false) {
  const volume = volumeDe(automatica);
  return backend.tipo === 'mpv' ? argumentosMpv(arquivo, { volume, ipc, ganho }) : argumentosVlc(arquivo, { volume, ganho });
}

// Só toca arquivos dentro da pasta de músicas (o caminho vem do banco).
function resolverArquivo(relativo) {
  const absoluto = path.resolve(config.musicasDir, relativo);
  return absoluto.startsWith(config.musicasDir + path.sep) ? absoluto : null;
}

const avisarFila = () => emitirTodos('fila');

function vinhetaDevida() {
  const { ativo, a_cada: aCada } = configuracoes.lerVinhetas();
  if (!ativo) {
    desdeVinheta = 0; // só conta as músicas depois que o dono liga: ao ligar não toca uma vinheta "atrasada"
    return false;
  }
  return desdeVinheta >= aCada && vinhetas.haAtivas();
}

function tick() {
  if (encerrando || atual || pausado) return;
  if (vinhetaDevida() && tocarVinheta()) return;

  let item = fila.proximo();
  // Fila vazia: se o modo automático estiver ligado, sorteia uma música pra não deixar o salão em silêncio.
  // Com intervalo, espera esse tempo de silêncio antes: a máquina "chama" o cliente sem tocar sem parar de graça.
  const intervaloMs = configuracoes.automaticoIntervaloMin() * 60_000;
  if (!item && Date.now() >= automaticoLivreEm && Date.now() - silencioDesde >= intervaloMs && configuracoes.automaticoAtivo()) {
    // Antes da aleatória, uma vinheta de chamada ("coloque créditos e escolha a sua"), se o dono gravou alguma.
    if (!chamadaFeita && configuracoes.automaticoVinheta() && vinhetas.haAtivas()) {
      chamadaFeita = true;
      if (tocarVinheta()) return;
    }
    item = fila.criarAutomatico(recentes, configuracoes.categoriasDaAutomatica(), { soTop: configuracoes.automaticoSoTop() });
  }
  if (item) {
    chamadaFeita = false;
    tocar(item);
  }
}

// Vinheta: áudio do dono entre duas músicas. Não passa pela fila, não custa crédito e não entra em ranking nem faturamento.
function tocarVinheta() {
  desdeVinheta = 0; // zera já: se o arquivo sumiu, não tenta de novo a cada ciclo
  const vinheta = vinhetas.proxima();
  if (!vinheta) return false;

  const simulado = backend.tipo === 'sim';
  const arquivo = vinhetas.caminhoAbsoluto(vinheta);
  if (!simulado && !arquivo) return false;

  atual = { vinheta: true, item: null, proc: null, timer: null, pulada: false, automatica: false, ipc: null };
  if (simulado) {
    const segundos = Math.min(vinheta.duracao ?? config.player.simSegundos, config.player.simSegundos);
    atual.timer = setTimeout(terminarVinheta, segundos * 1000);
    return true;
  }

  atual.ipc = backend.tipo === 'mpv' && backend.ipc ? novoCaminhoIpc() : null;
  const proc = spawn(backend.comando, argumentos(arquivo, atual.ipc), { stdio: 'ignore', ...opcoesSubprocesso });
  atual.proc = proc;
  let encerrado = false;
  const fim = () => {
    if (encerrado) return;
    encerrado = true;
    terminarVinheta();
  };
  proc.once('error', (erro) => {
    console.error(`[player] falha ao tocar a vinheta: ${erro.message}`);
    fim();
  });
  proc.once('exit', fim);
  return true;
}

function terminarVinheta() {
  if (encerrando) return;
  clearTimeout(atual?.timer);
  atual = null;
  setImmediate(tick);
}

function tocar(item) {
  const simulado = backend.tipo === 'sim';
  const segundos = simulado
    ? Math.min(item.duracao ?? config.player.simSegundos, config.player.simSegundos)
    : (item.duracao ?? 180);

  recentes = [...recentes, item.musica_id].slice(-RECENTES_MAX);
  desdeVinheta += 1;
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
  const ganho = volumeParelho.ganhoParaItem(item); // volume parelho: dB a somar/subtrair nesta faixa (0 = desligado)
  const comecouEm = Date.now();
  const proc = spawn(backend.comando, argumentos(arquivo, atual.ipc, ganho, atual.automatica), { stdio: 'ignore', ...opcoesSubprocesso });
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
  proc.once('exit', (codigo) => {
    const pulada = Boolean(atual?.pulada);
    const durouMs = Date.now() - comecouEm;
    const tocouDeVerdade = codigo === 0 && durouMs >= TEMPO_MINIMO_MS;
    if (codigo === 0 && !tocouDeVerdade && !pulada) {
      console.error(`[player] "${item.titulo}" terminou em ${durouMs} ms sem tocar (arquivo ilegível?): crédito devolvido`);
    }
    fim(pulada || tocouDeVerdade);
  });
}

function terminar(item, sucesso) {
  if (encerrando) return;
  clearTimeout(atual?.timer);
  const automatica = atual?.automatica;
  atual = null;
  silencioDesde = Date.now();

  if (sucesso) {
    falhasSeguidas = 0;
    fila.concluir(item);
  } else {
    falhasSeguidas += 1;
    if (falhasSeguidas >= FALHAS_PARA_AVISAR) {
      avisar('player', `🔇 O player falhou ${falhasSeguidas} vezes seguidas (última faixa: "${item.titulo}"). Confira o som do computador e os arquivos de música.`, { intervaloMin: 30 });
    }
    fila.falhar(item);
    if (automatica) automaticoLivreEm = Date.now() + PAUSA_APOS_FALHA_AUTOMATICA_MS;
    else emitirSessao(item.session_id, 'sessao', obterSessao(item.session_id));
  }

  avisarFila();
  emitirTodos('top');
  setImmediate(tick);
}

export function iniciar() {
  encerrando = false;
  backend = escolherBackend();
  silencioDesde = Date.now();
  fila.recuperarTocando();
  intervalo = setInterval(tick, 2000);
  tick();
  return backend.tipo;
}

export function parar() {
  encerrando = true;
  clearInterval(intervalo);
  clearTimeout(atual?.timer);
  encerrarArvore(atual?.proc);
  atual = null;
}

// Aplica o volume gravado à música em andamento (só o mpv aceita mudança ao vivo; o resto vale na próxima faixa).
export async function aplicarVolume() {
  if (!atual?.ipc) return false;
  return definirVolumeMpv(atual.ipc, volumeDe(atual.automatica));
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
    if (atual.vinheta) terminarVinheta();
    else terminar(atual.item, true);
  } else {
    atual.pulada = true;
    encerrarArvore(atual.proc);
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
  vinheta: Boolean(atual?.vinheta),
  automatico: configuracoes.lerAutomatico(),
  volume: configuracoes.lerVolume(),
  volume_ao_vivo: Boolean(backend?.ipc),
  volume_parelho: configuracoes.lerNormalizacao().ativa,
});
