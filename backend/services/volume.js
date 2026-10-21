import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../config.js';
import { db } from '../database.js';
import { ErroApi } from '../erros.js';
import { encerrarArvore, opcoesSubprocesso } from '../subprocessos.js';
import * as configuracoes from './configuracoes.js';

// Volume parelho: o ffmpeg mede o loudness (LUFS) de cada faixa uma vez e o player aplica um ganho
// por música para todas soarem no mesmo nível. O ganho é limitado para não distorcer nem sumir com a faixa.
const GANHO_MAX_DB = 6;
const GANHO_MIN_DB = -12;
const FOLGA_PICO_DB = -1; // ao aumentar o volume, o pico da faixa não passa de -1 dBFS
const TEMPO_MAX_MEDICAO_MS = 120_000;
const VALIDADE_CACHE_MS = 30_000;

let ffmpegConhecido = null;
let cacheAlvo = null;
let analise = { rodando: false, feitas: 0, total: 0, falhas: 0, atual: null, ultima_falha: null, cancelar: false };
let agendada = null;
let encerrando = false;
const processos = new Set();

// ---------- ffmpeg ----------

// Confere a cada 30 s no máximo: quem instala o ffmpeg com o servidor ligado não precisa reiniciar.
export function ffmpegDisponivel() {
  const agora = Date.now();
  if (ffmpegConhecido && agora - ffmpegConhecido.em < VALIDADE_CACHE_MS) return ffmpegConhecido;
  const r = spawnSync(config.ffmpeg, ['-version'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
  const disponivel = !r.error && r.status === 0;
  const versao = disponivel ? String(r.stdout).split('\n')[0].replace(/^ffmpeg version\s+/i, '').split(' ')[0] : null;
  ffmpegConhecido = { disponivel, versao, em: agora };
  return ffmpegConhecido;
}

// O loudnorm imprime um bloco JSON no fim da saída de erro do ffmpeg.
export function lerJsonDoLoudnorm(texto) {
  const fim = texto.lastIndexOf('}');
  const inicio = fim < 0 ? -1 : texto.lastIndexOf('{', fim);
  if (inicio < 0) return null;
  try {
    const medido = JSON.parse(texto.slice(inicio, fim + 1));
    const lufs = Number(medido.input_i);
    const pico = Number(medido.input_tp);
    if (!Number.isFinite(lufs) || lufs < -70) return null; // faixa muda: o ffmpeg devolve "-inf"
    return { lufs, pico_db: Number.isFinite(pico) ? pico : null };
  } catch {
    return null;
  }
}

export function medir(arquivo) {
  return new Promise((resolve, reject) => {
    if (encerrando) return reject(new Error('Servidor encerrando.'));
    const argumentos = [
      '-hide_banner', '-nostats', '-threads', '1', '-i', arquivo, '-vn',
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-',
    ];
    const proc = spawn(config.ffmpeg, argumentos, { stdio: ['ignore', 'ignore', 'pipe'], ...opcoesSubprocesso });
    processos.add(proc);
    proc.once('close', () => processos.delete(proc));
    try { os.setPriority(proc.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* sem permissão: segue normal */ }

    let saida = '';
    proc.stderr.on('data', (pedaco) => {
      saida += pedaco;
      if (saida.length > 200_000) saida = saida.slice(-100_000);
    });
    const limite = setTimeout(() => { encerrarArvore(proc); reject(new Error('tempo esgotado ao medir')); }, TEMPO_MAX_MEDICAO_MS);
    proc.once('error', (erro) => { clearTimeout(limite); reject(erro); });
    proc.once('exit', (codigo) => {
      clearTimeout(limite);
      if (codigo !== 0) return reject(new Error(`o ffmpeg não conseguiu ler o arquivo (código ${codigo})`));
      const resultado = lerJsonDoLoudnorm(saida);
      return resultado ? resolve(resultado) : reject(new Error('não consegui ler a medição (faixa muda?)'));
    });
  });
}

// ---------- Ganho por música ----------

// Ganho em dB que leva a faixa ao alvo. O pico só limita o AUMENTO de volume (faixa já no limite não sobe).
export function ganhoDb({ lufs, pico_db: pico }, alvo) {
  if (!Number.isFinite(lufs) || !Number.isFinite(alvo)) return 0;
  let ganho = alvo - lufs;
  if (ganho > 0 && Number.isFinite(pico)) ganho = Math.min(ganho, Math.max(0, FOLGA_PICO_DB - pico));
  ganho = Math.min(GANHO_MAX_DB, Math.max(GANHO_MIN_DB, ganho));
  return Math.round(ganho * 10) / 10;
}

// Sem alvo definido, usa a mediana do acervo: o volume geral quase não muda, só fica parelho.
function medianaDoAcervo() {
  const agora = Date.now();
  if (cacheAlvo && agora - cacheAlvo.em < VALIDADE_CACHE_MS) return cacheAlvo.valor;
  const medidas = db.prepare('SELECT lufs FROM musicas WHERE lufs IS NOT NULL ORDER BY lufs').all().map((m) => m.lufs);
  let valor = null;
  if (medidas.length) {
    const meio = Math.floor(medidas.length / 2);
    valor = medidas.length % 2 ? medidas[meio] : (medidas[meio - 1] + medidas[meio]) / 2;
    valor = Math.round(valor * 10) / 10;
  }
  cacheAlvo = { valor, em: agora };
  return valor;
}

export function alvoEfetivo() {
  const { alvo } = configuracoes.lerNormalizacao();
  return alvo !== null ? alvo : medianaDoAcervo();
}

// Ganho (dB) que o player aplica a esta faixa. 0 = tocar como está.
export function ganhoParaItem(item) {
  if (!configuracoes.lerNormalizacao().ativa) return 0;
  const alvo = alvoEfetivo();
  return alvo === null ? 0 : ganhoDb(item, alvo);
}

// ---------- Análise do acervo ----------

const arquivoExiste = (relativo) => fs.existsSync(path.resolve(config.musicasDir, relativo));

export function cobertura() {
  const { total, analisadas } = db.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(lufs IS NOT NULL), 0) AS analisadas FROM musicas').get();
  return { total, analisadas };
}

export function estadoDaAnalise() {
  const { cancelar, ...resto } = analise;
  return resto;
}

export function resumo() {
  const { ativa, alvo } = configuracoes.lerNormalizacao();
  const { disponivel, versao } = ffmpegDisponivel();
  return {
    ativa,
    alvo,
    alvo_efetivo: alvoEfetivo(),
    ffmpeg: { disponivel, versao },
    cobertura: cobertura(),
    analise: estadoDaAnalise(),
  };
}

// Mede em fila (uma faixa por vez, prioridade baixa) para não atrapalhar a música que está tocando.
// Repete a busca no fim: faixas adicionadas durante a análise também entram.
async function processar() {
  const gravar = db.prepare('UPDATE musicas SET lufs = ?, pico_db = ? WHERE id = ?');
  const tentadas = new Set();
  try {
    while (!analise.cancelar) {
      const lote = db.prepare('SELECT id, arquivo FROM musicas WHERE lufs IS NULL').all()
        .filter((m) => !tentadas.has(m.id) && arquivoExiste(m.arquivo));
      if (!lote.length) break;
      analise.total += lote.length;

      for (const musica of lote) {
        if (analise.cancelar) break;
        tentadas.add(musica.id);
        analise.atual = musica.arquivo;
        try {
          const medido = await medir(path.resolve(config.musicasDir, musica.arquivo));
          if (!encerrando) gravar.run(medido.lufs, medido.pico_db, musica.id);
        } catch (erro) {
          analise.falhas += 1;
          analise.ultima_falha = `${musica.arquivo}: ${erro.message}`;
        }
        analise.feitas += 1;
        cacheAlvo = null;
      }
    }
  } finally {
    analise.rodando = false;
    analise.atual = null;
  }
}

export function iniciarAnalise() {
  if (encerrando) return estadoDaAnalise();
  if (analise.rodando) return estadoDaAnalise();
  if (!ffmpegDisponivel().disponivel) {
    throw new ErroApi(409, 'O ffmpeg não foi encontrado. Instale (winget install Gyan.FFmpeg) ou aponte FFMPEG_PATH no .env e tente de novo.', 'SEM_FFMPEG');
  }
  analise = { rodando: true, feitas: 0, total: 0, falhas: 0, atual: null, ultima_falha: null, cancelar: false };
  processar().catch((erro) => console.error('[volume] análise falhou:', erro.message));
  return estadoDaAnalise();
}

export function cancelarAnalise() {
  analise.cancelar = true;
  return estadoDaAnalise();
}

// Chamado quando entram músicas novas: se o volume parelho está ligado e há ffmpeg, mede em segundo plano.
// Nunca lança: cadastrar um CD não pode falhar por causa disso.
export function agendarAnalise() {
  if (encerrando) return;
  try {
    if (!configuracoes.lerNormalizacao().ativa) return;
    clearTimeout(agendada);
    agendada = setTimeout(() => {
      try {
        if (ffmpegDisponivel().disponivel) iniciarAnalise();
      } catch { /* sem ffmpeg: o aviso aparece na aba Player */ }
    }, 3000);
    agendada.unref?.();
  } catch { /* melhor esforço */ }
}

export function encerrarTudo() {
  encerrando = true;
  cancelarAnalise();
  clearTimeout(agendada);
  for (const proc of processos) encerrarArvore(proc);
}
