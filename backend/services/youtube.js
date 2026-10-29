import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import { config } from '../config.js';
import { emitirTodos } from '../events.js';
import { encerrarArvore as matar, opcoesSubprocesso } from '../subprocessos.js';

// Ponte com o yt-dlp (https://github.com/yt-dlp/yt-dlp), que o dono instala à parte. Este arquivo só fala com o
// programa: pesquisar, ler os dados de um vídeo e baixar o áudio. Quem pode pedir, quanto custa e a fila ficam em sobdemanda.js.
//
// Regras de segurança: o ID do vídeo é validado (11 letras, números, "-" ou "_") antes de virar nome de arquivo ou
// endereço; o yt-dlp nunca roda dentro de um shell; todo processo tem tempo máximo e é morto com os filhos dele.

const ID_VALIDO = /^[A-Za-z0-9_-]{11}$/;
const EXTENSOES = new Set(['.m4a', '.mp3', '.aac', '.opus', '.ogg', '.webm', '.flac', '.wav']);
const FORMATO = 'bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio'; // áudio puro: não precisa do ffmpeg
const TAMANHO_MAX = '40M';
const TAMANHO_MIN_BYTES = 30 * 1024;
const RESULTADOS_BUSCA = 15;
const SAIDA_MAX_BYTES = 8 * 1024 * 1024;

export const DURACAO_MIN_SEG = 30;

export class ErroYoutube extends Error {
  // codigo: AUSENTE | OCUPADO | TEMPO | INDISPONIVEL | BLOQUEADO | LONGO | ARQUIVO_INVALIDO | FALHOU
  constructor(codigo, mensagem) {
    super(mensagem);
    this.codigo = codigo;
  }
}

// ---------- Textos e endereços ----------

export function idValido(valor) {
  const id = typeof valor === 'string' ? valor.trim() : '';
  return ID_VALIDO.test(id) ? id : null;
}

// Título de vídeo é texto de terceiros: tira o que é invisível ou de controle e limita o tamanho.
export const limparTitulo = (texto) => String(texto ?? '')
  .normalize('NFC')
  .replace(/\s+/g, ' ')
  .replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠﻿]/g, '')
  .replace(/ {2,}/g, ' ')
  .trim()
  .slice(0, 140);

const urlDoVideo = (id) => `https://www.youtube.com/watch?v=${id}`;
export const miniaturaDe = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

const MIN_CAPA = 80;
const MAX_CAPA = 4 * 1024 * 1024;
const EXT_CAPA = ['.jpg', '.png', '.webp'];

// JPEG, PNG ou WebP de verdade. Página de erro e arquivo vazio não passam.
export function extensaoDeImagem(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < MIN_CAPA || buffer.length > MAX_CAPA) return null;
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return '.jpg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return '.png';
  if (buffer.length >= 12 && buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') return '.webp';
  return null;
}

// ---------- Execução do programa ----------

// Um script .js no lugar do programa só existe para os testes automáticos.
function comando() {
  const alvo = config.youtube.ytdlp;
  return /\.[cm]?js$/i.test(alvo) ? { exe: process.execPath, prefixo: [alvo] } : { exe: alvo, prefixo: [] };
}

const emAndamento = new Set(); // processos do yt-dlp rodando agora
let encerrando = false;

// Ao desligar o servidor não deixa download nenhum rodando solto (nem arquivo pela metade).
export function encerrarTudo() {
  encerrando = true;
  for (const proc of emAndamento) matar(proc);
}

function executar(args, { tempoMs, maxSaida = SAIDA_MAX_BYTES }) {
  return new Promise((resolve, reject) => {
    if (encerrando) return reject(new ErroYoutube('FALHOU', 'Servidor encerrando.'));
    const { exe, prefixo } = comando();
    const proc = spawn(exe, [...prefixo, ...args], {
      ...opcoesSubprocesso,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    });
    emAndamento.add(proc);

    let terminou = false;
    let bytes = 0;
    let erro = '';
    const partes = [];
    const encerrar = (acao, valor) => {
      if (terminou) return;
      terminou = true;
      clearTimeout(relogio);
      emAndamento.delete(proc);
      acao(valor);
    };
    const relogio = setTimeout(() => {
      matar(proc);
      encerrar(reject, new ErroYoutube('TEMPO', 'O yt-dlp demorou demais e foi cancelado.'));
    }, tempoMs);

    proc.stdout.on('data', (pedaco) => {
      bytes += pedaco.length;
      if (bytes > maxSaida) {
        matar(proc);
        encerrar(reject, new ErroYoutube('FALHOU', 'O yt-dlp devolveu dados demais.'));
        return;
      }
      partes.push(pedaco);
    });
    proc.stderr.on('data', (pedaco) => { erro = (erro + pedaco).slice(-6000); });
    proc.once('error', (e) => {
      if (e.code === 'ENOENT') {
        marcarAusente();
        encerrar(reject, new ErroYoutube('AUSENTE', 'O yt-dlp não está instalado neste computador.'));
      } else {
        encerrar(reject, new ErroYoutube('FALHOU', `Não consegui rodar o yt-dlp: ${e.message}`));
      }
    });
    proc.once('close', (codigo) => encerrar(resolve, { codigo, saida: Buffer.concat(partes).toString('utf8'), erro }));
  });
}

// Traduz o que o yt-dlp reclamou numa causa que o dono entende. O texto técnico só aparece no painel dele.
function erroDoYtdlp({ codigo, erro }) {
  const texto = String(erro);
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const bruta = linhas.filter((l) => /^ERROR:/i.test(l)).pop() ?? linhas.pop() ?? '';
  const resumo = bruta.replace(/^ERROR:\s*/i, '').replace(/\[youtube\]\s*[\w-]{11}:\s*/i, '').slice(0, 300) || `o yt-dlp saiu com código ${codigo}`;

  // Problemas daquele vídeo (removido, privado, só para maiores...): não indicam defeito do yt-dlp.
  if (/video is (unavailable|private|not available)|video unavailable|private video|has been removed|no longer available|not available in your country|made this video available in your country|blocked it|copyright grounds|has been terminated|members[- ]only|this live event|premieres in|requires payment|confirm your age|age[- ]restricted/i.test(texto)) {
    return new ErroYoutube('INDISPONIVEL', resumo);
  }
  // O YouTube desconfiou do computador ("não sou um robô"): afeta todos os pedidos até configurar o login.
  if (/sign in to confirm|not a bot/i.test(texto)) {
    return new ErroYoutube('BLOQUEADO', `${resumo} (o YouTube pediu login; veja YTDLP_ARGS_EXTRA no .env)`);
  }
  return new ErroYoutube('FALHOU', resumo);
}

// Limita quantos processos rodam ao mesmo tempo; o excesso espera numa fila curta (e é recusado se ela encher).
function criarLimite(maximo, maxEspera) {
  let ativos = 0;
  const esperando = [];
  const liberar = () => {
    const proximo = esperando.shift();
    if (proximo) proximo(); // a vaga passa direto para quem esperava
    else ativos -= 1;
  };
  return async (tarefa) => {
    if (ativos < maximo) {
      ativos += 1;
    } else if (esperando.length >= maxEspera) {
      throw new ErroYoutube('OCUPADO', 'Há pedidos demais em andamento.');
    } else {
      await new Promise((resolver) => esperando.push(resolver));
    }
    try {
      return await tarefa();
    } finally {
      liberar();
    }
  };
}

const limiteBusca = criarLimite(2, 8);
const limiteBaixar = criarLimite(2, 30);

// ---------- Situação do programa ----------

const estado = { ok: false, versao: null, jsRuntime: false, erro: null, verificadoEm: 0 };

export const pronto = () => estado.ok;

export const situacao = () => ({
  ok: estado.ok,
  versao: estado.versao,
  js_runtime: estado.jsRuntime,
  erro: estado.erro,
  verificado_em: estado.verificadoEm ? new Date(estado.verificadoEm).toISOString() : null,
  caminho: config.youtube.ytdlp,
});

// Os celulares escondem ou mostram a busca na internet conforme isto; avisa quando muda.
function definirOk(ok, erro = null) {
  const mudou = estado.ok !== ok;
  estado.ok = ok;
  estado.erro = erro;
  estado.verificadoEm = Date.now();
  if (mudou) emitirTodos('config');
}

function marcarAusente() {
  definirOk(false, 'O programa yt-dlp não foi encontrado neste computador.');
}

let verificacao = null;

// Confere se o yt-dlp existe e responde, e se ele aceita usar o Node para resolver os desafios do YouTube.
export function verificar() {
  verificacao ??= (async () => {
    try {
      const r = await executar(['--version'], { tempoMs: 25_000 });
      if (r.codigo !== 0) throw new ErroYoutube('FALHOU', 'O yt-dlp não respondeu direito.');
      const versao = r.saida.trim().split(/\r?\n/)[0];
      if (versao !== estado.versao) {
        const ajuda = await executar(['--help'], { tempoMs: 25_000, maxSaida: 2 * 1024 * 1024 }).catch(() => null);
        estado.jsRuntime = Boolean(ajuda?.saida.includes('--js-runtimes'));
      }
      estado.versao = versao;
      definirOk(true);
    } catch (erro) {
      definirOk(false, erro.codigo === 'AUSENTE' ? 'O programa yt-dlp não foi encontrado neste computador.' : erro.message);
    }
    return situacao();
  })().finally(() => { verificacao = null; });
  return verificacao;
}

export const verificadoHaMs = () => (estado.verificadoEm ? Date.now() - estado.verificadoEm : Infinity);

// O YouTube muda de tempos em tempos e o yt-dlp precisa acompanhar: "-U" baixa a versão mais nova do próprio programa.
export async function atualizar() {
  const antes = estado.versao;
  const r = await executar(['-U'], { tempoMs: 150_000 });
  const saida = `${r.saida}\n${r.erro}`.trim().split(/\r?\n/).filter(Boolean).slice(-6).join('\n');
  await verificar();
  return { ok: r.codigo === 0, saida, versao_antes: antes, versao_depois: estado.versao, atualizou: antes !== estado.versao };
}

// ---------- Opções comuns ----------

const argumentosBase = () => [
  '--ignore-config', '--no-warnings', '--no-color', '--socket-timeout', '15',
  // Com o Node (que o projeto já exige) o yt-dlp resolve sozinho os desafios do YouTube, sem instalar o Deno.
  ...(estado.jsRuntime ? ['--js-runtimes', `node:${process.execPath}`] : []),
  ...config.youtube.argsExtra,
];

function lerEntrada(objeto) {
  const id = idValido(objeto?.id);
  if (!id) return null;
  const duracao = Number.isFinite(objeto.duration) ? Math.round(objeto.duration) : null;
  const aoVivo = ['is_live', 'is_upcoming', 'post_live'].includes(objeto.live_status) || duracao === null;
  return {
    id,
    titulo: limparTitulo(objeto.title) || 'Sem título',
    canal: limparTitulo(objeto.channel ?? objeto.uploader ?? ''),
    duracao,
    aoVivo,
  };
}

// ---------- Pesquisar, consultar e baixar ----------

// Lista os primeiros vídeos da busca (sem baixar nada).
export function pesquisar(termo) {
  return limiteBusca(async () => {
    const r = await executar(
      [...argumentosBase(), '--flat-playlist', '--dump-json', `ytsearch${RESULTADOS_BUSCA}:${termo}`],
      { tempoMs: config.youtube.tempoBuscaS * 1000 },
    );
    if (r.codigo !== 0) throw erroDoYtdlp(r);
    const vistos = new Set();
    const itens = [];
    for (const linha of r.saida.split('\n')) {
      let objeto;
      try { objeto = JSON.parse(linha); } catch { continue; }
      const item = lerEntrada(objeto);
      if (item && !vistos.has(item.id)) {
        vistos.add(item.id);
        itens.push(item);
      }
    }
    return itens;
  });
}

// Dados confiáveis de um vídeo (título, duração, se é ao vivo). O pedido usa isto, nunca o que o celular informar.
export function metadados(id) {
  return limiteBusca(async () => {
    const r = await executar(
      [...argumentosBase(), '--no-playlist', '--skip-download', '--dump-single-json', '--', urlDoVideo(id)],
      { tempoMs: config.youtube.tempoBuscaS * 1000, maxSaida: 12 * 1024 * 1024 },
    );
    if (r.codigo !== 0) throw erroDoYtdlp(r);
    let objeto;
    try { objeto = JSON.parse(r.saida); } catch { throw new ErroYoutube('FALHOU', 'Resposta ilegível do yt-dlp.'); }
    const item = lerEntrada(objeto);
    if (!item || item.id !== id) throw new ErroYoutube('FALHOU', 'O yt-dlp devolveu outro vídeo.');
    return item;
  });
}

const relativoDaPasta = (nome) => path.relative(config.musicasDir, path.join(config.youtube.pasta, nome)).split(path.sep).join('/');

function nomesDoVideo(id) {
  try {
    return fs.readdirSync(config.youtube.pasta).filter((nome) => nome.startsWith(`${id}.`));
  } catch {
    return [];
  }
}

// Sobras de um download interrompido (.part, .ytdl) ou de uma tentativa anterior.
export function apagarRestos(id) {
  for (const nome of nomesDoVideo(id)) fs.rmSync(path.join(config.youtube.pasta, nome), { force: true });
}

async function conferirAudio(caminho, duracaoEsperada) {
  const { size } = fs.statSync(caminho);
  if (size < TAMANHO_MIN_BYTES) throw new ErroYoutube('ARQUIVO_INVALIDO', 'O arquivo baixado veio vazio.');
  let duracao = null;
  try {
    const { format } = await parseFile(caminho, { duration: true });
    duracao = format.duration ?? null;
  } catch {
    throw new ErroYoutube('ARQUIVO_INVALIDO', 'O arquivo baixado não é um áudio válido.');
  }
  // Alguns áudios do YouTube não trazem a duração no cabeçalho: só reprova quando ela existe e é bem menor que a esperada.
  if (duracao && duracaoEsperada && duracao < duracaoEsperada * 0.6) {
    throw new ErroYoutube('ARQUIVO_INVALIDO', 'O arquivo baixado veio incompleto.');
  }
  return size;
}

// A capa fica em musicas/capas, nunca em SobDemanda/<id>.*. apagarRestos e a limpeza de órfãos
// apagam tudo que começa com o ID do vídeo dentro da pasta do áudio.
const dirCapas = () => path.join(config.musicasDir, 'capas');
const nomeCapa = (id, ext) => `yt-${id}${ext}`;

function acharCapa(id) {
  const dir = dirCapas();
  for (const ext of EXT_CAPA) {
    const nome = nomeCapa(id, ext);
    try {
      const st = fs.statSync(path.join(dir, nome));
      if (st.isFile() && st.size >= MIN_CAPA && st.size <= MAX_CAPA) return nome;
    } catch { /* ainda não existe */ }
  }
  return null;
}

function gravarCapa(id, buffer) {
  const ext = extensaoDeImagem(buffer);
  if (!ext) return null;
  const dir = dirCapas();
  fs.mkdirSync(dir, { recursive: true });
  const nome = nomeCapa(id, ext);
  const destino = path.join(dir, nome);
  const parcial = path.join(dir, `.${nome}.parcial`);
  try {
    fs.writeFileSync(parcial, buffer, { mode: 0o644 });
    fs.renameSync(parcial, destino);
  } catch {
    fs.rmSync(parcial, { force: true });
    return null;
  }
  for (const outra of EXT_CAPA) {
    if (outra !== ext) fs.rmSync(path.join(dir, nomeCapa(id, outra)), { force: true });
  }
  return nome;
}

function enderecosDaCapa(id) {
  return [
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    miniaturaDe(id),
  ];
}

// Miniatura pública do próprio vídeo. Sem redirecionamento: o endereço é só i.ytimg.com + o ID já validado.
async function capaPelaRede(id) {
  if (process.env.JUKEBOX_CAPA_HTTP === '0') return null;
  for (const url of enderecosDaCapa(id)) {
    try {
      const resposta = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: { Accept: 'image/jpeg,image/png,image/webp' },
      });
      if (!resposta.ok) continue;
      const tipo = (resposta.headers.get('content-type') || '').toLowerCase();
      if (tipo.startsWith('text/') || tipo.includes('html') || tipo.includes('json')) continue;
      const nome = gravarCapa(id, Buffer.from(await resposta.arrayBuffer()));
      if (nome) return nome;
    } catch { /* tenta o próximo endereço */ }
  }
  return null;
}

// O yt-dlp grava a miniatura num diretório temporário. Só o conteúdo validado vai para capas/yt-<id>.<ext>.
async function capaPeloPrograma(id) {
  const tmp = path.join(dirCapas(), `.tmp-${id}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  try {
    const r = await executar([
      ...argumentosBase(),
      '--no-playlist', '--skip-download', '--write-thumbnail', '--no-mtime', '--no-progress',
      '-o', path.join(tmp, 'capa.%(ext)s'),
      '--', urlDoVideo(id),
    ], { tempoMs: Math.min(config.youtube.tempoBuscaS * 1000, 25_000) });
    if (r.codigo !== 0) return null;
    for (const nome of fs.readdirSync(tmp)) {
      if (nome !== path.basename(nome)) continue;
      const caminho = path.join(tmp, nome);
      if (path.resolve(caminho).startsWith(path.resolve(tmp) + path.sep) === false) continue;
      let st;
      try { st = fs.lstatSync(caminho); } catch { continue; }
      if (!st.isFile()) continue;
      const salvo = gravarCapa(id, fs.readFileSync(caminho));
      if (salvo) return salvo;
    }
    return null;
  } catch {
    return null;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const capasEmCurso = new Map();

// Baixa a capa daquele vídeo. Falha (rede, yt-dlp, arquivo inválido) devolve null e não atrapalha o áudio.
export function baixarCapa(id) {
  if (!idValido(id)) return Promise.resolve(null);
  const pronta = acharCapa(id);
  if (pronta) return Promise.resolve(pronta);
  let tarefa = capasEmCurso.get(id);
  if (!tarefa) {
    tarefa = (async () => (await capaPelaRede(id)) ?? capaPeloPrograma(id))()
      .catch(() => null)
      .finally(() => capasEmCurso.delete(id));
    capasEmCurso.set(id, tarefa);
  }
  return tarefa;
}

// Baixa o áudio para <pasta de músicas>/SobDemanda/<id>.<ext> e, depois, a capa em musicas/capas.
// Devolve o caminho do áudio (relativo à pasta de músicas) e o nome da capa, ou null se a imagem não vier.
// A duração máxima também vai para o yt-dlp (--match-filter), então um vídeo longo é recusado mesmo que o pedido minta.
export function baixar(id, { maxSegundos, duracaoEsperada = null }) {
  return limiteBaixar(async () => {
    if (!idValido(id)) throw new ErroYoutube('FALHOU', 'ID de vídeo inválido.');
    fs.mkdirSync(config.youtube.pasta, { recursive: true });
    apagarRestos(id);

    const modelo = path.join(config.youtube.pasta, `${id}.%(ext)s`);
    let r;
    try {
      r = await executar([
        ...argumentosBase(),
        '--no-playlist', '--no-progress', '--no-mtime',
        '-f', FORMATO,
        '--max-filesize', TAMANHO_MAX,
        '--match-filter', `duration<=${maxSegundos + 5} & !is_live`,
        '--retries', '3', '--fragment-retries', '3',
        '-o', modelo,
        '--', urlDoVideo(id),
      ], { tempoMs: config.youtube.tempoBaixarS * 1000 });
    } catch (erro) {
      apagarRestos(id);
      throw erro;
    }
    if (r.codigo !== 0) {
      apagarRestos(id);
      throw erroDoYtdlp(r);
    }

    const nome = nomesDoVideo(id)
      .filter((n) => EXTENSOES.has(path.extname(n).toLowerCase()))
      .sort((a, b) => fs.statSync(path.join(config.youtube.pasta, b)).size - fs.statSync(path.join(config.youtube.pasta, a)).size)[0];
    if (!nome) {
      apagarRestos(id);
      const recusado = /does not pass filter|larger than max-filesize/i.test(`${r.saida}\n${r.erro}`);
      throw new ErroYoutube(recusado ? 'LONGO' : 'FALHOU', recusado
        ? 'O vídeo passa do tempo ou do tamanho máximo permitido.'
        : 'O yt-dlp terminou sem gerar o arquivo de áudio.');
    }

    let bytes;
    try {
      bytes = await conferirAudio(path.join(config.youtube.pasta, nome), duracaoEsperada);
    } catch (erro) {
      apagarRestos(id);
      throw erro;
    }
    // A capa é extra: se não vier, a música segue sem ela e o crédito não volta.
    let capa = null;
    try { capa = await baixarCapa(id); } catch { capa = null; }
    return { arquivo: relativoDaPasta(nome), bytes, capa };
  });
}

// Apaga da pasta o que nenhuma música do banco usa (sobra de uma queda no meio do download).
export function removerOrfaos(arquivosConhecidos) {
  let removidos = 0;
  let nomes;
  try { nomes = fs.readdirSync(config.youtube.pasta, { withFileTypes: true }); } catch { return 0; }
  for (const entrada of nomes) {
    if (!entrada.isFile() || arquivosConhecidos.has(relativoDaPasta(entrada.name))) continue;
    try {
      fs.rmSync(path.join(config.youtube.pasta, entrada.name), { force: true });
      removidos += 1;
    } catch { /* em uso: fica para a próxima */ }
  }
  return removidos;
}
