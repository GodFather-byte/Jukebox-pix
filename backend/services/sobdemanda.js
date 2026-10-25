import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { agora, db, normalizar, novoId, registrarLogCd } from '../database.js';
import { ErroApi } from '../erros.js';
import { emitirSessao, emitirTodos } from '../events.js';
import { acordar } from '../player.js';
import { avisar } from './alertas.js';
import { precoEfetivo } from './catalogo.js';
import * as configuracoes from './configuracoes.js';
import * as fila from './fila.js';
import { creditar, debitar, obterSessao, rotulo } from './sessoes.js';
import * as youtube from './youtube.js';

// Música pedida pela internet. O cliente pesquisa, paga com créditos e a jukebox baixa o áudio (yt-dlp),
// a capa daquele vídeo, e põe na fila. Se a capa não vier, a música entra mesmo assim: o crédito não volta por causa dela.
//
// Dinheiro: o crédito é cobrado ao pedir, e o pedido guarda de onde saiu (pago ou cortesia). Se o download falhar,
// travar ou o servidor cair, o crédito volta ao mesmo saldo. Depois de baixada, a música entra na fila já paga e
// segue as regras de sempre: só vira faturamento quando toca (historico_reproducao), como qualquer outra.
// Todo desfecho passa por um UPDATE condicionado a status = 'baixando': um pedido nunca é concluído e devolvido ao mesmo tempo.

const MAX_PREPAROS_POR_PESSOA = 2;
const MAX_PREPAROS_TOTAL = 8;
const CONSULTAS_POR_SESSAO = 12; // idas ao yt-dlp (busca nova ou consulta de um vídeo), a cada 5 minutos
const CONSULTAS_POR_IP = 60;
const JANELA_BUSCAS_MS = 5 * 60_000;
const CACHE_BUSCA_MS = 10 * 60_000;
const CACHE_DADOS_MS = 2 * 60 * 60_000;
const CACHE_DADOS_MAX = 500;
const PREPARO_MAX_MS = 10 * 60_000; // pedido que passa disso é devolvido
const DISCO_MINIMO_BYTES = 1024 ** 3;
const FALHAS_PARA_AVISAR = 3;
const RESULTADOS_MAX = 10;

// A pasta "Sob demanda" é criada sozinha no primeiro download (e recriada se o dono apagar o CD).
const CATEGORIA_ID = 'sob-demanda';
const ARTISTA_ID = 'sob-demanda';
const CD_ID = 'sob-demanda';

const buscasPorSessao = new Map(); // chave -> horários das últimas buscas (memória; zera ao reiniciar)
const buscasPorIp = new Map();
const cacheBusca = new Map(); // termo sem acento/caixa -> { em, itens }
const cacheDados = new Map(); // id do vídeo -> { em, dados } (dados vindos do yt-dlp, nunca do celular)
const preparos = new Map(); // id do vídeo -> download em andamento (um só serve a todos que pediram a mesma música)
let falhasDeBusca = 0;
let falhasDeDownload = 0;

const contar = (sql, ...parametros) => db.prepare(sql).get(...parametros).total;

// ---------- Erros ----------

function paraErroApi(erro) {
  if (erro instanceof ErroApi) return erro;
  if (erro instanceof youtube.ErroYoutube) {
    switch (erro.codigo) {
      case 'AUSENTE': return new ErroApi(503, 'A busca na internet está fora do ar no momento.', 'YOUTUBE_INDISPONIVEL');
      case 'OCUPADO': return new ErroApi(429, 'Muita gente pesquisando agora. Tente de novo em instantes.', 'YOUTUBE_OCUPADO');
      case 'TEMPO': return new ErroApi(504, 'A pesquisa demorou demais. Tente de novo.', 'YOUTUBE_TEMPO');
      case 'INDISPONIVEL': return new ErroApi(404, 'Não consegui acessar esse vídeo (ele pode ter sido removido ou ser privado).', 'YOUTUBE_NAO_ACHOU');
      default: return new ErroApi(502, 'Não consegui consultar a internet agora. Tente de novo mais tarde.', 'YOUTUBE_FALHOU');
    }
  }
  return erro;
}

// Falha de vídeo específico (privado, removido, longo demais) não diz nada sobre o yt-dlp. Falha geral, três seguidas, avisa o dono.
function registrarResultado(tipo, erro = null) {
  const defeitoGeral = erro && (!(erro instanceof youtube.ErroYoutube) || ['FALHOU', 'TEMPO', 'BLOQUEADO', 'AUSENTE'].includes(erro.codigo));
  if (erro && !defeitoGeral) return;
  if (tipo === 'busca') falhasDeBusca = erro ? falhasDeBusca + 1 : 0;
  else falhasDeDownload = erro ? falhasDeDownload + 1 : 0;

  const seguidas = tipo === 'busca' ? falhasDeBusca : falhasDeDownload;
  if (erro && seguidas >= FALHAS_PARA_AVISAR) {
    avisar('youtube', `🌐 ${tipo === 'busca' ? 'A busca' : 'O download'} de músicas da internet falhou ${seguidas} vezes seguidas (${erro.message}). Pode ser a internet do local ou o yt-dlp desatualizado: no painel, aba Internet, use "Atualizar o yt-dlp". Os créditos dos clientes foram devolvidos.`, { intervaloMin: 120, chave: `youtube-${tipo}` });
  }
}

// ---------- Regras de entrada ----------

function exigirAtivo() {
  const cfg = configuracoes.lerYoutube();
  if (!cfg.ativo) throw new ErroApi(403, 'Pedir músicas da internet não está disponível agora.', 'YOUTUBE_DESATIVADO');
  if (!youtube.pronto()) throw new ErroApi(503, 'A busca na internet está fora do ar no momento. Tente de novo mais tarde.', 'YOUTUBE_INDISPONIVEL');
  return cfg;
}

function exigirSessao(sessionId) {
  if (!sessionId || !obterSessao(sessionId)) throw new ErroApi(404, 'Sessão não encontrada');
}

function exigirEspaco() {
  try {
    const { bsize, bavail } = fs.statfsSync(config.musicasDir);
    if (bsize * bavail < DISCO_MINIMO_BYTES) throw new ErroApi(503, 'O computador está sem espaço para baixar músicas agora.', 'DISCO_CHEIO');
  } catch (erro) {
    if (erro instanceof ErroApi) throw erro; // não conseguiu medir: segue
  }
}

function dentroDoLimite(mapa, chave, maximo) {
  const desde = Date.now() - JANELA_BUSCAS_MS;
  const recentes = (mapa.get(chave) ?? []).filter((t) => t > desde);
  const cabe = recentes.length < maximo;
  mapa.set(chave, cabe ? [...recentes, Date.now()] : recentes);
  return cabe;
}

// Cada ida ao yt-dlp gasta processador e internet do notebook: limita por sessão e por aparelho (IP).
function limitarConsultas(sessionId, ip) {
  if (!dentroDoLimite(buscasPorSessao, sessionId, CONSULTAS_POR_SESSAO) || !dentroDoLimite(buscasPorIp, ip ?? 'desconhecido', CONSULTAS_POR_IP)) {
    throw new ErroApi(429, 'Você pesquisou muitas vezes seguidas. Espere um pouquinho e tente de novo.', 'LIMITE_BUSCAS');
  }
}

const limparTermo = (bruto) => {
  const termo = youtube.limparTitulo(bruto).slice(0, 80);
  return /[\p{L}\p{N}]{2}/u.test(termo) ? termo : '';
};

// Dentro de parênteses, estas palavras só enfeitam o título do vídeo ("Official Video", "Letra", "4K"...).
const ENFEITE = /\b(official|oficial|video|clipe|clip|audio|lyrics?|letra|visuali[sz]er|hd|4k|uhd|remaster(?:ed)?)\b/;

// Tira do título o enfeite típico de vídeo: [colchetes] e (Official Video), (Letra), (4K)... Parênteses com informação de
// verdade, como (Ao Vivo) ou (feat. Fulano), ficam. Se sobrar quase nada, fica o título original.
export function semEnfeites(titulo) {
  const original = String(titulo ?? '').trim();
  let texto = original;
  for (let i = 0; i < 3; i += 1) {
    const antes = texto;
    texto = texto
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\(([^()]*)\)/g, (grupo, dentro) => (ENFEITE.test(normalizar(dentro)) ? ' ' : grupo));
    if (texto === antes) break;
  }
  const limpo = texto.replace(/\s+/g, ' ').replace(/(?:\s*[-–—|:•·]+)+\s*$/, '').replace(/^\s*[-–—|:•·]+\s*/, '').trim();
  return limpo.length >= 3 ? limpo : original;
}

// Título como aparece na lista: sem o enfeite do vídeo e, se ele não diz quem canta, com o canal no fim.
export function tituloDaMusica(titulo, canal) {
  const limpo = semEnfeites(youtube.limparTitulo(titulo));
  const artista = youtube.limparTitulo(canal).replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
  const jaTemArtista = /\s[-–—|]\s|:/.test(limpo) || (artista && normalizar(limpo).includes(normalizar(artista)));
  return (jaTemArtista || !artista ? limpo : `${limpo} — ${artista}`).slice(0, 140);
}

function guardarDados(itens) {
  const agoraMs = Date.now();
  for (const dados of itens) cacheDados.set(dados.id, { em: agoraMs, dados });
  while (cacheDados.size > CACHE_DADOS_MAX) cacheDados.delete(cacheDados.keys().next().value);
}

const dadosEmCache = (id) => {
  const guardado = cacheDados.get(id);
  return guardado && Date.now() - guardado.em < CACHE_DADOS_MS ? guardado.dados : null;
};

// ---------- Busca ----------

function montarResultados(itens, cfg) {
  const validos = itens.filter((i) => !i.aoVivo && i.duracao >= youtube.DURACAO_MIN_SEG && i.duracao <= cfg.max_min * 60);
  const naCasa = new Map();
  if (validos.length) {
    const linhas = db.prepare(`
      SELECT m.youtube_id, m.creditos, m.oculta, c.oculto, c.status AS cd_status
        FROM musicas m JOIN cds c ON c.id = m.cd_id
       WHERE m.youtube_id IN (${validos.map(() => '?').join(',')})
    `).all(...validos.map((i) => i.id));
    for (const linha of linhas) naCasa.set(linha.youtube_id, linha);
  }

  const lista = [];
  for (const item of validos) {
    const casa = naCasa.get(item.id);
    if (casa && (casa.oculta || casa.oculto)) continue; // o dono escondeu: não oferece de novo
    lista.push({
      video_id: item.id,
      titulo: item.titulo,
      canal: item.canal,
      duracao: item.duracao,
      thumb: youtube.miniaturaDe(item.id),
      creditos: casa ? precoEfetivo(casa) : cfg.preco,
      na_casa: Boolean(casa), // já foi baixada antes: entra na fila na hora
    });
  }
  return lista.slice(0, RESULTADOS_MAX);
}

export async function buscar(sessionId, termoBruto, ip) {
  const cfg = exigirAtivo();
  exigirSessao(sessionId);
  const termo = limparTermo(termoBruto);
  if (!termo) throw new ErroApi(400, 'Escreva o nome da música ou do artista (pelo menos 2 letras).');

  const chave = normalizar(termo);
  let guardado = cacheBusca.get(chave);
  if (!guardado || Date.now() - guardado.em > CACHE_BUSCA_MS) {
    limitarConsultas(sessionId, ip);
    try {
      guardado = { em: Date.now(), itens: await youtube.pesquisar(termo) };
      registrarResultado('busca');
    } catch (erro) {
      registrarResultado('busca', erro);
      throw paraErroApi(erro);
    }
    cacheBusca.set(chave, guardado);
    if (cacheBusca.size > 200) cacheBusca.delete(cacheBusca.keys().next().value);
    guardarDados(guardado.itens);
  }
  return { resultados: montarResultados(guardado.itens, cfg), preco: cfg.preco, max_min: cfg.max_min };
}

// ---------- Pedido ----------

// Dados que o pedido usa: o que o yt-dlp mostrou na busca (guardado aqui) ou, se não houver, uma consulta nova.
async function dadosDoVideo(id, cfg, sessionId, ip) {
  let dados = dadosEmCache(id);
  if (!dados) {
    limitarConsultas(sessionId, ip);
    try {
      dados = await youtube.metadados(id);
    } catch (erro) {
      registrarResultado('busca', erro);
      throw paraErroApi(erro);
    }
    guardarDados([dados]);
  }
  if (dados.aoVivo) throw new ErroApi(422, 'Transmissões ao vivo não podem ser pedidas.', 'YOUTUBE_AO_VIVO');
  if (dados.duracao < youtube.DURACAO_MIN_SEG) throw new ErroApi(422, 'Esse vídeo é curto demais para ser uma música.', 'YOUTUBE_CURTO');
  if (dados.duracao > cfg.max_min * 60) throw new ErroApi(422, `Só aceitamos músicas de até ${cfg.max_min} minutos.`, 'YOUTUBE_LONGO');
  return dados;
}

const acharNaCasa = (videoId) => db.prepare(`
  SELECT m.id, m.oculta, c.oculto FROM musicas m JOIN cds c ON c.id = m.cd_id WHERE m.youtube_id = ?
`).get(videoId);

const CAPA_SALVA = /^yt-[A-Za-z0-9_-]{11}\.(jpg|png|webp)$/;

// Faixa antiga, baixada antes de existir capa por música: tenta a imagem sem segurar a fila.
function completarCapa(videoId) {
  youtube.baixarCapa(videoId).then((capa) => {
    if (!capa || !CAPA_SALVA.test(capa)) return;
    const mudou = db.prepare('UPDATE musicas SET capa = ? WHERE youtube_id = ? AND capa IS NULL').run(capa, videoId).changes;
    if (mudou) emitirTodos('fila');
  }).catch(() => {});
}

// Já baixada por alguém: é uma música como as outras (mesmas regras de fila e de preço).
function entrarNaFilaDaCasa(sessionId, musica, videoId) {
  if (musica.oculta || musica.oculto) throw new ErroApi(409, 'Essa música não está disponível.', 'INDISPONIVEL');
  const { id, saldo } = fila.adicionar(sessionId, musica.id);
  if (videoId && !db.prepare('SELECT capa FROM musicas WHERE id = ?').get(musica.id)?.capa) completarCapa(videoId);
  emitirTodos('fila');
  emitirSessao(sessionId, 'sessao', obterSessao(sessionId));
  acordar();
  return { pronto: true, fila_id: id, musica_id: musica.id, saldo };
}

// Checa as regras e cobra numa só transação: pedido recusado não gasta crédito, e dois toques seguidos não cobram duas vezes.
const reservar = db.transaction((sessionId, dados, cfg) => {
  const naCasa = acharNaCasa(dados.id); // alguém terminou de baixar enquanto consultávamos
  if (naCasa) return { naCasa };

  if (db.prepare("SELECT 1 FROM pedidos_youtube WHERE session_id = ? AND video_id = ? AND status = 'baixando'").get(sessionId, dados.id)) {
    throw new ErroApi(409, 'Você já pediu essa música: ela está sendo preparada.', 'JA_PEDIDA');
  }
  const meus = contar("SELECT COUNT(*) AS total FROM pedidos_youtube WHERE session_id = ? AND status = 'baixando'", sessionId);
  if (meus >= MAX_PREPAROS_POR_PESSOA) {
    throw new ErroApi(429, 'Você já tem músicas da internet sendo preparadas. Espere entrarem na fila para pedir outra.', 'PREPAROS_LIMITE');
  }
  const emPreparo = contar("SELECT COUNT(*) AS total FROM pedidos_youtube WHERE status = 'baixando'");
  if (emPreparo >= MAX_PREPAROS_TOTAL) {
    throw new ErroApi(429, 'Muitas músicas da internet estão sendo preparadas agora. Tente de novo em instantes.', 'PREPAROS_CHEIO');
  }
  if (contar("SELECT COUNT(*) AS total FROM fila WHERE status IN ('aguardando', 'tocando')") + emPreparo >= config.filaMax) {
    throw new ErroApi(409, 'A fila está cheia. Tente de novo daqui a pouco.', 'FILA_CHEIA');
  }

  const regras = configuracoes.lerRegras();
  const limitePessoa = regras.max_pedidos_por_pessoa;
  if (limitePessoa > 0) {
    const naFila = contar("SELECT COUNT(*) AS total FROM fila WHERE session_id = ? AND status IN ('aguardando', 'tocando')", sessionId);
    if (naFila + meus >= limitePessoa) {
      throw new ErroApi(409, `Você já tem ${limitePessoa} ${limitePessoa === 1 ? 'música' : 'músicas'} na fila. Aguarde uma tocar para pedir outra.`, 'LIMITE_PEDIDOS');
    }
  }
  if (regras.bloquear_repeticao_min > 0
    && db.prepare("SELECT 1 FROM pedidos_youtube WHERE video_id = ? AND status = 'baixando'").get(dados.id)) {
    throw new ErroApi(409, 'Essa música já está sendo preparada para outra pessoa. Escolha outra!', 'REPETIDA');
  }

  const gasto = debitar(sessionId, cfg.preco);
  if (!gasto) throw new ErroApi(402, 'Saldo insuficiente. Adicione créditos para continuar.', 'SALDO_INSUFICIENTE');

  const pedido = {
    id: novoId(),
    session_id: sessionId,
    video_id: dados.id,
    titulo: dados.titulo,
    canal: dados.canal,
    duracao: dados.duracao,
    creditos: cfg.preco,
    creditos_cortesia: gasto.cortesia,
    status: 'baixando',
    criado_em: agora(),
  };
  db.prepare(`
    INSERT INTO pedidos_youtube (id, session_id, video_id, titulo, canal, duracao, creditos, creditos_cortesia, status, criado_em, atualizado_em)
    VALUES (@id, @session_id, @video_id, @titulo, @canal, @duracao, @creditos, @creditos_cortesia, @status, @criado_em, @criado_em)
  `).run(pedido);
  return { pedido };
});

const paraCliente = (p) => ({ id: p.id, video_id: p.video_id, titulo: p.titulo, status: p.status, criado_em: p.criado_em });

export async function comprar(sessionId, videoIdBruto, ip) {
  const cfg = exigirAtivo();
  exigirSessao(sessionId);
  const videoId = youtube.idValido(videoIdBruto);
  if (!videoId) throw new ErroApi(400, 'Música inválida.');

  const jaTem = acharNaCasa(videoId);
  if (jaTem) return entrarNaFilaDaCasa(sessionId, jaTem, videoId);

  // Sem saldo nem consulta ao yt-dlp: quem ainda não pagou não gasta a internet do notebook.
  if (obterSessao(sessionId).saldo < cfg.preco) throw new ErroApi(402, 'Saldo insuficiente. Adicione créditos para continuar.', 'SALDO_INSUFICIENTE');
  exigirEspaco();
  const dados = await dadosDoVideo(videoId, cfg, sessionId, ip);
  const reserva = reservar(sessionId, dados, cfg);
  if (reserva.naCasa) return entrarNaFilaDaCasa(sessionId, reserva.naCasa, videoId);

  const { pedido } = reserva;
  console.log(`[internet] preparando "${pedido.titulo}" (${pedido.video_id}) para ${rotulo(sessionId)}`);
  emitirSessao(sessionId, 'sessao', obterSessao(sessionId));
  executarPedido(pedido, cfg).catch((erro) => console.error('[internet] erro inesperado:', erro));
  return { pronto: false, pedido: paraCliente(pedido), saldo: obterSessao(sessionId).saldo };
}

// ---------- Download e desfecho ----------

function prepararArquivo(pedido, cfg) {
  let tarefa = preparos.get(pedido.video_id);
  if (!tarefa) {
    tarefa = youtube.baixar(pedido.video_id, { maxSegundos: cfg.max_min * 60, duracaoEsperada: pedido.duracao })
      .finally(() => preparos.delete(pedido.video_id));
    preparos.set(pedido.video_id, tarefa);
  }
  return tarefa;
}

// Cria (se não existir) a categoria, o artista e o CD "Músicas Sob Demanda" que guardam o que foi baixado.
function garantirCd() {
  const agoraIso = agora();
  db.prepare("INSERT OR IGNORE INTO categorias (id, nome, icone, cor) VALUES (?, 'Sob demanda', '🌐', '#00B8D9')").run(CATEGORIA_ID);
  db.prepare("INSERT OR IGNORE INTO artistas (id, nome, categoria_id, criado_em) VALUES (?, 'Da internet', ?, ?)").run(ARTISTA_ID, CATEGORIA_ID, agoraIso);
  const criou = db.prepare(`
    INSERT OR IGNORE INTO cds (id, titulo, artista_id, categoria_id, status, data_criacao, data_lancamento, criado_em)
    VALUES (?, 'Músicas Sob Demanda', ?, ?, 'lancado', ?, ?, ?)
  `).run(CD_ID, ARTISTA_ID, CATEGORIA_ID, agoraIso, agoraIso, agoraIso).changes;
  if (criou) registrarLogCd(CD_ID, 'Músicas Sob Demanda', 'criado', 'CD criado sozinho para as músicas pedidas pela internet');
  return CD_ID;
}

const concluirNoBanco = db.transaction((pedidoId, arquivo, capa) => {
  const pedido = db.prepare("SELECT * FROM pedidos_youtube WHERE id = ? AND status = 'baixando'").get(pedidoId);
  if (!pedido) return null; // já foi devolvido (passou do tempo ou o servidor reiniciou): não entra na fila

  const capaSalva = CAPA_SALVA.test(capa) ? capa : null;
  let musica = db.prepare('SELECT id FROM musicas WHERE youtube_id = ?').get(pedido.video_id);
  const nova = !musica;
  if (nova) {
    const cdId = garantirCd();
    musica = { id: novoId() };
    db.prepare(`
      INSERT INTO musicas (id, titulo, cd_id, duracao, creditos, arquivo, youtube_id, capa, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(musica.id, tituloDaMusica(pedido.titulo, pedido.canal), cdId, pedido.duracao, configuracoes.lerYoutube().preco, arquivo, pedido.video_id, capaSalva, agora());
  } else if (capaSalva) {
    db.prepare('UPDATE musicas SET capa = ? WHERE id = ? AND capa IS NULL').run(capaSalva, musica.id);
  }
  db.prepare("UPDATE pedidos_youtube SET status = 'na_fila', musica_id = ?, atualizado_em = ? WHERE id = ?").run(musica.id, agora(), pedidoId);
  const filaId = fila.adicionarPaga(pedido.session_id, musica.id, { creditos: pedido.creditos, cortesia: pedido.creditos_cortesia });
  return { pedido, musicaId: musica.id, filaId, nova };
});

// Devolve ao cliente exatamente de onde saiu o dinheiro (pago ou cortesia).
const falharNoBanco = db.transaction((pedidoId, motivo) => {
  const pedido = db.prepare("SELECT * FROM pedidos_youtube WHERE id = ? AND status = 'baixando'").get(pedidoId);
  if (!pedido) return null;
  db.prepare("UPDATE pedidos_youtube SET status = 'falhou', erro = ?, atualizado_em = ? WHERE id = ?").run(String(motivo).slice(0, 300), agora(), pedidoId);
  creditar(pedido.session_id, pedido.creditos - pedido.creditos_cortesia, pedido.creditos_cortesia);
  return pedido;
});

function avisarCliente(pedido, status) {
  emitirSessao(pedido.session_id, 'sessao', obterSessao(pedido.session_id));
  emitirSessao(pedido.session_id, 'youtube', { id: pedido.id, video_id: pedido.video_id, titulo: pedido.titulo, status, creditos: pedido.creditos });
}

async function executarPedido(pedido, cfg) {
  const inicio = Date.now();
  try {
    const { arquivo, capa } = await prepararArquivo(pedido, cfg);
    const resultado = concluirNoBanco(pedido.id, arquivo, capa ?? null);
    registrarResultado('download');
    if (!resultado) return;
    console.log(`[internet] "${pedido.titulo}" pronta em ${((Date.now() - inicio) / 1000).toFixed(1)} s e na fila`);
    avisarCliente(pedido, 'na_fila');
    emitirTodos('fila');
    if (resultado.nova) emitirTodos('lancamentos'); // o CD "Sob demanda" passa a aparecer nas categorias
    acordar();
  } catch (erro) {
    registrarResultado('download', erro);
    console.error(`[internet] "${pedido.titulo}" falhou (crédito devolvido): ${erro.message}`);
    const devolvido = falharNoBanco(pedido.id, erro.message);
    if (devolvido) avisarCliente(devolvido, 'falhou');
  }
}

// Pedidos do cliente: os que ainda estão sendo preparados e os que terminaram há pouco.
export function listarDaSessao(sessionId) {
  exigirSessao(sessionId);
  const desde = new Date(Date.now() - 30 * 60_000).toISOString();
  return db.prepare(`
    SELECT id, video_id, titulo, status, criado_em FROM pedidos_youtube
     WHERE session_id = ? AND (status = 'baixando' OR atualizado_em >= ?)
     ORDER BY criado_em DESC LIMIT 6
  `).all(sessionId, desde);
}

// ---------- Dono ----------

function tamanhoDaPasta() {
  try {
    return fs.readdirSync(config.youtube.pasta, { withFileTypes: true })
      .reduce((total, e) => total + (e.isFile() ? fs.statSync(path.join(config.youtube.pasta, e.name)).size : 0), 0);
  } catch {
    return 0;
  }
}

export async function situacao() {
  if (youtube.verificadoHaMs() > 60_000) await youtube.verificar();
  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);
  const desde = inicioDoDia.toISOString();
  const ate = new Date(Date.now() + 60_000).toISOString();

  const hoje = db.prepare(`
    SELECT COUNT(*) AS pedidos, COALESCE(SUM(status = 'na_fila'), 0) AS ok, COALESCE(SUM(status = 'falhou'), 0) AS falhas
      FROM pedidos_youtube WHERE criado_em >= ?
  `).get(desde);
  const tocadas = db.prepare(`
    SELECT COUNT(*) AS tocadas, COALESCE(SUM(h.creditos), 0) AS bruto
      FROM historico_reproducao h JOIN musicas m ON m.id = h.musica_id
     WHERE m.youtube_id IS NOT NULL AND h.tocado_em >= ? AND h.tocado_em < ?
  `).get(desde, ate);

  return {
    config: configuracoes.lerYoutube(),
    ytdlp: youtube.situacao(),
    em_preparo: contar("SELECT COUNT(*) AS total FROM pedidos_youtube WHERE status = 'baixando'"),
    hoje: { ...hoje, ...tocadas },
    acervo: { musicas: contar('SELECT COUNT(*) AS total FROM musicas WHERE youtube_id IS NOT NULL'), bytes: tamanhoDaPasta() },
    recentes: db.prepare(`
      SELECT id, session_id, video_id, titulo, canal, status, creditos, erro, criado_em, atualizado_em
        FROM pedidos_youtube ORDER BY criado_em DESC LIMIT 15
    `).all().map(({ session_id: sessionId, ...resto }) => ({ ...resto, quem: rotulo(sessionId) })),
  };
}

export async function salvarConfig(entrada) {
  const ajustes = configuracoes.salvarYoutube(entrada);
  if (ajustes.ativo) await youtube.verificar(); // ligou: confere o yt-dlp na hora
  emitirTodos('config'); // os celulares mostram ou escondem a busca na internet
  return ajustes;
}

// ---------- Rotinas ----------

// Pedido que ficou "preparando" por tempo demais (download travado que nem o limite de tempo resolveu) volta ao cliente.
function vigiar() {
  const limite = new Date(Date.now() - PREPARO_MAX_MS).toISOString();
  for (const { id } of db.prepare("SELECT id FROM pedidos_youtube WHERE status = 'baixando' AND criado_em < ?").all(limite)) {
    const devolvido = falharNoBanco(id, 'Passou do tempo máximo de preparo (10 minutos).');
    if (devolvido) avisarCliente(devolvido, 'falhou');
  }

  const desde = Date.now() - JANELA_BUSCAS_MS;
  for (const mapa of [buscasPorSessao, buscasPorIp]) {
    for (const [chave, horarios] of mapa) if (!horarios.some((t) => t > desde)) mapa.delete(chave);
  }
  for (const [chave, { em }] of cacheBusca) if (Date.now() - em > CACHE_BUSCA_MS) cacheBusca.delete(chave);

  // O yt-dlp que o dono acabou de instalar passa a valer sem reiniciar; se sumir, a busca some do celular.
  if (configuracoes.lerYoutube().ativo && youtube.verificadoHaMs() > (youtube.pronto() ? 30 * 60_000 : 60_000)) {
    youtube.verificar().catch(() => {});
  }
}

// Ao subir: devolve o que ficou preparando quando o servidor caiu, apaga arquivos soltos e confere o yt-dlp.
export function iniciarSobDemanda() {
  for (const { id } of db.prepare("SELECT id FROM pedidos_youtube WHERE status = 'baixando'").all()) {
    falharNoBanco(id, 'O servidor foi reiniciado durante o preparo.');
  }
  const conhecidos = new Set(db.prepare('SELECT arquivo FROM musicas WHERE youtube_id IS NOT NULL').all().map((l) => l.arquivo));
  const removidos = youtube.removerOrfaos(conhecidos);
  if (removidos) console.log(`[internet] ${removidos} arquivo(s) solto(s) apagado(s) da pasta SobDemanda`);

  if (configuracoes.lerYoutube().ativo) youtube.verificar().catch(() => {});

  setInterval(() => {
    try {
      vigiar();
    } catch (erro) {
      console.error('[internet]', erro.message);
    }
  }, 30_000).unref();
  // Pedidos antigos (30 dias) saem do histórico do painel.
  setInterval(() => {
    db.prepare("DELETE FROM pedidos_youtube WHERE status <> 'baixando' AND atualizado_em < ?").run(new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString());
  }, 6 * 60 * 60_000).unref();
}
