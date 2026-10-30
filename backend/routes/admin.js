import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { agora, db, novoId, registrarLogCd, slug } from '../database.js';
import { ErroApi } from '../erros.js';
import { emitirSessao, emitirTodos } from '../events.js';
import { criarToken, exigirAdmin, limitarLogin, senhaConfere } from '../middleware/auth.js';
import * as player from '../player.js';
import * as backup from '../services/backup.js';
import { apagarArquivo, capasDir, criarArtista, criarCd, EXT_AUDIO, EXT_IMAGEM, validarPreco } from '../services/biblioteca.js';
import * as cartazes from '../services/cartazes.js';
import { buscar } from '../services/catalogo.js';
import * as configuracoes from '../services/configuracoes.js';
import * as cortesia from '../services/cortesia.js';
import { adicionarDaCasa, listar, remover } from '../services/fila.js';
import * as fechamento from '../services/fechamento.js';
import * as importacao from '../services/importacao.js';
import * as recados from '../services/recados.js';
import * as relatorio from '../services/relatorio.js';
import { obterSessao } from '../services/sessoes.js';
import * as sistema from '../services/sistema.js';
import * as sobdemanda from '../services/sobdemanda.js';
import * as sugestoes from '../services/sugestoes.js';
import * as telegram from '../services/telegram.js';
import * as vales from '../services/vales.js';
import * as vinhetas from '../services/vinhetas.js';
import * as volumeParelho from '../services/volume.js';
import * as youtube from '../services/youtube.js';
import { telasConectadas } from '../events.js';

const router = Router();

const uploadDir = path.join(config.musicasDir, '_upload');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => cb(null, `${novoId()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 80 * 1024 * 1024, files: 61 },
  fileFilter: (req, file, cb) => {
    const permitidas = file.fieldname === 'capa' ? EXT_IMAGEM : EXT_AUDIO;
    if (!permitidas.has(path.extname(file.originalname).toLowerCase())) {
      return cb(new ErroApi(400, `Tipo de arquivo não permitido: ${file.originalname}`));
    }
    cb(null, true);
  },
});

// Uploads pequenos (vinheta de áudio, imagem de cartaz): arquivo único, limite próprio, mesma pasta temporária.
function uploadUnico(campo, extensoes, limiteMb, mensagemDeTipo) {
  return multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (req, file, cb) => cb(null, `${novoId()}${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: limiteMb * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
      if (!extensoes.has(path.extname(file.originalname).toLowerCase())) return cb(new ErroApi(400, mensagemDeTipo));
      cb(null, true);
    },
  }).single(campo);
}
const enviarVinheta = uploadUnico('arquivo', EXT_AUDIO, 15, 'Envie um áudio MP3, M4A, WAV, FLAC ou OGG.');
const enviarCartaz = uploadUnico('imagem', EXT_IMAGEM, 6, 'Envie uma imagem JPG, PNG ou WebP.');

// ---------- Login ----------

router.post('/login', limitarLogin, (req, res) => {
  if (!senhaConfere(req.body?.senha)) throw new ErroApi(401, 'Senha incorreta');
  res.json({ token: criarToken() });
});

router.use(exigirAdmin);

// ---------- Cadastros ----------

router.get('/cadastros', (req, res) => {
  res.json({
    categorias: db.prepare('SELECT * FROM categorias ORDER BY nome').all(),
    artistas: db.prepare('SELECT * FROM artistas ORDER BY nome').all(),
  });
});

router.post('/categorias', (req, res) => {
  const { nome, icone, cor } = req.body ?? {};
  const id = slug(nome);
  if (!id) throw new ErroApi(400, 'Informe o nome da categoria');
  if (db.prepare('SELECT 1 FROM categorias WHERE id = ?').get(id)) throw new ErroApi(409, 'Categoria já existe');
  db.prepare('INSERT INTO categorias (id, nome, icone, cor) VALUES (?, ?, ?, ?)')
    .run(id, String(nome).trim(), icone || '🎵', cor || '#FF1493');
  res.status(201).json({ id });
});

router.put('/categorias/:id', (req, res) => {
  const atual = db.prepare('SELECT * FROM categorias WHERE id = ?').get(req.params.id);
  if (!atual) throw new ErroApi(404, 'Categoria não encontrada');
  const { nome = atual.nome, icone = atual.icone, cor = atual.cor } = req.body ?? {};
  db.prepare('UPDATE categorias SET nome = ?, icone = ?, cor = ? WHERE id = ?').run(nome, icone, cor, atual.id);
  res.json({ sucesso: true });
});

router.post('/artistas', (req, res) => {
  const { nome, categoria_id: categoriaId } = req.body ?? {};
  if (!db.prepare('SELECT 1 FROM categorias WHERE id = ?').get(categoriaId)) throw new ErroApi(400, 'Categoria inválida');
  res.status(201).json({ id: criarArtista(nome, categoriaId) });
});

router.put('/artistas/:id', (req, res) => {
  const atual = db.prepare('SELECT * FROM artistas WHERE id = ?').get(req.params.id);
  if (!atual) throw new ErroApi(404, 'Artista não encontrado');
  const { nome = atual.nome, categoria_id: categoriaId = atual.categoria_id } = req.body ?? {};
  if (!db.prepare('SELECT 1 FROM categorias WHERE id = ?').get(categoriaId)) throw new ErroApi(400, 'Categoria inválida');
  db.prepare('UPDATE artistas SET nome = ?, categoria_id = ? WHERE id = ?').run(nome, categoriaId, atual.id);
  res.json({ sucesso: true });
});

// ---------- Biblioteca ----------

router.get('/biblioteca', (req, res) => {
  const cds = db.prepare(`
    SELECT c.id, c.titulo, c.ano, c.capa, c.status, c.data_lancamento,
           c.artista_id, c.categoria_id, c.oculto,
           a.nome AS artista, cat.nome AS categoria, cat.icone,
           COUNT(m.id) AS total_musicas, COALESCE(SUM(m.vezes_tocada), 0) AS vezes_tocadas,
           COALESCE(MIN(m.creditos), 1) AS preco_min, COALESCE(MAX(m.creditos), 1) AS preco_max
      FROM cds c
      JOIN artistas a ON a.id = c.artista_id
      JOIN categorias cat ON cat.id = c.categoria_id
      LEFT JOIN musicas m ON m.cd_id = c.id
     GROUP BY c.id
     ORDER BY c.criado_em DESC
  `).all();
  res.json({ cds });
});

router.get('/movimentacoes', (req, res) => {
  res.json({ movimentacoes: db.prepare('SELECT * FROM log_cds ORDER BY id DESC LIMIT 100').all() });
});

router.post(
  '/cds/adicionar',
  upload.fields([{ name: 'capa', maxCount: 1 }, { name: 'arquivos', maxCount: 60 }]),
  async (req, res) => {
    const audios = req.files?.arquivos ?? [];
    const capa = req.files?.capa?.[0] ?? null;
    const temporarios = [...audios, ...(capa ? [capa] : [])].map((f) => f.path);

    try {
      let titulosManuais = [];
      try { titulosManuais = JSON.parse(req.body.titulos || '[]'); } catch { /* ignora: usa as tags */ }

      const cd = await criarCd({
        titulo: req.body.titulo,
        ano: req.body.ano,
        categoriaId: req.body.categoria_id,
        artistaId: req.body.artista_id,
        artistaNome: req.body.artista_nome,
        status: req.body.status === 'lancado' ? 'lancado' : 'novo',
        preco: req.body.preco,
        capa: capa && { caminho: capa.path, nomeOriginal: capa.originalname },
        faixas: audios.map((audio, i) => ({ caminho: audio.path, nomeOriginal: audio.originalname, tituloManual: titulosManuais[i] })),
      });

      emitirTodos('lancamentos');
      res.status(201).json(cd);
    } finally {
      // Em caso de erro os arquivos voltam pra pasta temporária; aqui some o que sobrou de lá.
      for (const arquivo of temporarios) apagarArquivo(arquivo);
    }
  },
);

// ---------- Importação em lote (pasta) ----------

router.get('/importacao', (req, res) => {
  res.json(importacao.listar(req.query.origem === 'externo' ? 'externo' : 'importar'));
});

router.post('/importacao', async (req, res) => {
  const { chaves, categoria_id: categoriaId, status, preco, origem } = req.body ?? {};
  const resultado = await importacao.importar({
    chaves,
    categoriaId,
    status: status === 'lancado' ? 'lancado' : 'novo',
    preco,
    origem: origem === 'externo' ? 'externo' : 'importar',
  });
  if (resultado.importados.length) emitirTodos('lancamentos');
  res.json(resultado);
});

router.put('/cds/:id', (req, res) => {
  const cd = db.prepare('SELECT * FROM cds WHERE id = ?').get(req.params.id);
  if (!cd) throw new ErroApi(404, 'CD não encontrado');

  const { titulo = cd.titulo, ano = cd.ano, categoria_id: categoriaId = cd.categoria_id, artista_id: artistaId = cd.artista_id, status = cd.status, oculto = cd.oculto } = req.body ?? {};
  if (!['novo', 'lancado'].includes(status)) throw new ErroApi(400, 'Status inválido');
  if (!db.prepare('SELECT 1 FROM categorias WHERE id = ?').get(categoriaId)) throw new ErroApi(400, 'Categoria inválida');
  if (!db.prepare('SELECT 1 FROM artistas WHERE id = ?').get(artistaId)) throw new ErroApi(400, 'Artista inválido');

  // Preço de todas as músicas do CD (vale para pedidos novos; o que já está na fila foi cobrado pelo preço antigo).
  const enviado = req.body?.preco;
  const preco = enviado === undefined || enviado === null || enviado === '' ? null : validarPreco(enviado);

  let dataLancamento = cd.data_lancamento;
  if (status !== cd.status) {
    dataLancamento = status === 'novo'
      ? new Date(Date.now() + config.lancamentoDias * 24 * 60 * 60_000).toISOString()
      : agora();
  }

  db.transaction(() => {
    db.prepare('UPDATE cds SET titulo = ?, ano = ?, categoria_id = ?, artista_id = ?, status = ?, data_lancamento = ?, oculto = ? WHERE id = ?')
      .run(titulo, ano ? Number(ano) : null, categoriaId, artistaId, status, dataLancamento, oculto ? 1 : 0, cd.id);
    if (preco !== null) db.prepare('UPDATE musicas SET creditos = ? WHERE cd_id = ?').run(preco, cd.id);
  })();
  const mudancas = [];
  if (status !== cd.status) mudancas.push(`status: ${cd.status} → ${status}`);
  if (Boolean(oculto) !== Boolean(cd.oculto)) mudancas.push(oculto ? 'ocultado do app' : 'voltou a aparecer no app');
  if (preco !== null) mudancas.push(`preço: ${preco} ${preco === 1 ? 'crédito' : 'créditos'} por música`);
  registrarLogCd(cd.id, titulo, 'editado', mudancas.join('; ') || null);

  emitirTodos('lancamentos');
  emitirTodos('top');
  res.json({ sucesso: true });
});

const apagarCd = db.transaction((id) => {
  const cd = db.prepare('SELECT * FROM cds WHERE id = ?').get(id);
  if (!cd) return null;

  const tocandoAgora = db.prepare(`
    SELECT 1 FROM fila f JOIN musicas m ON m.id = f.musica_id
     WHERE m.cd_id = ? AND f.status = 'tocando'
  `).get(id);
  if (tocandoAgora) throw new ErroApi(409, 'Uma música deste CD está tocando agora. Aguarde ou pule a faixa.');

  const musicas = db.prepare('SELECT id, arquivo FROM musicas WHERE cd_id = ?').all(id);
  const aguardando = db.prepare(`
    SELECT f.id FROM fila f JOIN musicas m ON m.id = f.musica_id
     WHERE m.cd_id = ? AND f.status = 'aguardando'
  `).all(id);
  const reembolsados = aguardando.map((item) => remover(item.id)).filter(Boolean);

  db.prepare('DELETE FROM cds WHERE id = ?').run(id);
  registrarLogCd(id, cd.titulo, 'removido', `${musicas.length} música(s); ${reembolsados.length} da fila reembolsada(s)`);
  return { cd, musicas, reembolsados };
});

router.delete('/cds/:id', (req, res) => {
  const resultado = apagarCd(req.params.id);
  if (!resultado) throw new ErroApi(404, 'CD não encontrado');

  const { cd, musicas, reembolsados } = resultado;
  const emUso = db.prepare('SELECT 1 FROM musicas WHERE arquivo = ?');
  const pastas = new Set();
  for (const musica of musicas) {
    const arquivo = path.resolve(config.musicasDir, musica.arquivo);
    // Nunca apaga arquivo compartilhado ou solto na raiz da pasta de músicas.
    if (path.dirname(arquivo) !== config.musicasDir && arquivo.startsWith(config.musicasDir + path.sep) && !emUso.get(musica.arquivo)) {
      apagarArquivo(arquivo);
      pastas.add(path.dirname(arquivo));
    }
  }
  for (const pasta of pastas) {
    // rmdir só remove pasta vazia: o artista e o CD somem se não sobrou nada neles.
    for (const dir of [pasta, path.dirname(pasta)]) {
      if (dir === config.musicasDir) continue;
      try { fs.rmdirSync(dir); } catch { /* não está vazia */ }
    }
  }
  if (cd.capa) apagarArquivo(path.join(capasDir, path.basename(cd.capa)));

  for (const item of reembolsados) emitirSessao(item.session_id, 'sessao', obterSessao(item.session_id));
  emitirTodos('fila');
  emitirTodos('lancamentos');
  emitirTodos('top');
  res.json({ sucesso: true, reembolsados: reembolsados.length });
});

// ---------- Player e fila ----------

router.get('/player', (req, res) => {
  res.json({ ...player.estado(), ...listar(null, 100) });
});

router.post('/player/pular', (req, res) => {
  res.json({ sucesso: player.pular() });
});

router.post('/player/pausar', (req, res) => {
  player.pausar();
  res.json({ sucesso: true });
});

router.post('/player/retomar', (req, res) => {
  player.retomar();
  res.json({ sucesso: true });
});

router.delete('/fila/:id', (req, res) => {
  const item = remover(req.params.id);
  if (!item) throw new ErroApi(404, 'Item não está mais aguardando na fila');
  emitirSessao(item.session_id, 'sessao', obterSessao(item.session_id));
  emitirTodos('fila');
  res.json({ sucesso: true });
});

// ---------- Console do dono: achar música, pôr na fila, ocultar ----------

// Diferente da busca do cliente, esta também mostra o que está oculto (pra poder reexibir).
router.get('/musicas', (req, res) => {
  res.json({ musicas: buscar(String(req.query.q ?? '').slice(0, 80), null, { incluirOcultas: true }) });
});

// modo: 'fila' (no fim), 'seguir' (à frente de todos) ou 'agora' (corta a que está tocando).
router.post('/fila/casa', (req, res) => {
  const { musica_id: musicaId, modo = 'fila' } = req.body ?? {};
  if (!['fila', 'seguir', 'agora'].includes(modo)) throw new ErroApi(400, 'Modo inválido');

  adicionarDaCasa(musicaId, { aSeguir: modo !== 'fila' });
  emitirTodos('fila');
  if (modo !== 'agora' || !player.pular()) player.acordar();
  res.status(201).json({ sucesso: true });
});

router.put('/musicas/:id/oculta', (req, res) => {
  const musica = db.prepare('SELECT m.id, m.titulo, m.cd_id, c.titulo AS cd FROM musicas m JOIN cds c ON c.id = m.cd_id WHERE m.id = ?').get(req.params.id);
  if (!musica) throw new ErroApi(404, 'Música não encontrada');

  const oculta = req.body?.oculta ? 1 : 0;
  db.prepare('UPDATE musicas SET oculta = ? WHERE id = ?').run(oculta, musica.id);
  registrarLogCd(musica.cd_id, musica.cd, 'editado', `música "${musica.titulo}" ${oculta ? 'ocultada do app' : 'voltou a aparecer no app'}`);
  emitirTodos('top');
  emitirTodos('lancamentos');
  res.json({ sucesso: true, oculta: Boolean(oculta) });
});

// Preço de uma música só (exceção ao preço do CD).
router.put('/musicas/:id/preco', (req, res) => {
  const musica = db.prepare('SELECT m.id, m.titulo, m.cd_id, c.titulo AS cd FROM musicas m JOIN cds c ON c.id = m.cd_id WHERE m.id = ?').get(req.params.id);
  if (!musica) throw new ErroApi(404, 'Música não encontrada');

  const preco = validarPreco(req.body?.creditos);
  db.prepare('UPDATE musicas SET creditos = ? WHERE id = ?').run(preco, musica.id);
  registrarLogCd(musica.cd_id, musica.cd, 'editado', `música "${musica.titulo}": ${preco} ${preco === 1 ? 'crédito' : 'créditos'}`);
  emitirTodos('top');
  res.json({ sucesso: true, creditos: preco });
});

router.post('/acervo/ocultar-sem-arquivo', (req, res) => {
  const ocultadas = sistema.ocultarSemArquivo();
  if (ocultadas) {
    emitirTodos('top');
    emitirTodos('lancamentos');
  }
  res.json({ ocultadas });
});

// ---------- Volume ----------

router.put('/volume', async (req, res) => {
  const volume = configuracoes.salvarVolume(req.body?.volume);
  const aoVivo = await player.aplicarVolume();
  res.json({ volume, aplicado_ao_vivo: aoVivo });
});

// ---------- Playlist automática ----------

router.put('/automatico', (req, res) => {
  const { ativo, interrompe, intervalo_min: intervaloMin, so_top: soTop, volume, vinheta, trecho_seg: trechoSeg, categorias, agenda } = req.body ?? {};
  const ajustes = configuracoes.salvarAutomatico({ ativo, interrompe, intervalo_min: intervaloMin, so_top: soTop, volume, vinheta, trecho_seg: trechoSeg, categorias, agenda });
  if (ajustes.ativo) player.acordar();
  res.json(ajustes);
});

// ---------- Créditos de cortesia do dono ----------

router.get('/cortesia', (req, res) => {
  res.json(cortesia.situacao());
});

router.post('/cortesia', (req, res) => {
  const sessao = cortesia.conceder(Number(req.body?.quantidade), req.body?.session_id);
  emitirSessao(sessao.id, 'sessao', sessao);
  res.status(201).json({ session_id: sessao.id, saldo: sessao.saldo, saldo_cortesia: sessao.saldo_cortesia });
});

// ---------- Regras da casa ----------

router.get('/regras', (req, res) => {
  res.json(configuracoes.lerRegras());
});

router.put('/regras', (req, res) => {
  const regras = configuracoes.salvarRegras(req.body ?? {});
  emitirTodos('config'); // os celulares atualizam aviso, vendas e prioridade sem recarregar
  res.json(regras);
});

// ---------- Saúde (alimenta os avisos fixos do painel) ----------

router.get('/saude', (req, res) => {
  const estado = player.estado();
  res.json({
    player: { backend: estado.backend, simulado: estado.backend === 'sim', vinheta: estado.vinheta },
    telas: telasConectadas(),
    telegram: telegram.configurado(),
    recados_pendentes: db.prepare("SELECT COUNT(*) AS n FROM recados WHERE status = 'pendente'").get().n,
  });
});

// ---------- Volume parelho ----------

router.get('/volume-parelho', (req, res) => {
  res.json(volumeParelho.resumo());
});

router.put('/volume-parelho', (req, res) => {
  const { ativa, alvo } = req.body ?? {};
  configuracoes.salvarNormalizacao({ ativa, alvo });
  if (ativa) volumeParelho.agendarAnalise(); // ligou: mede o que ainda não foi medido (se houver ffmpeg)
  res.json(volumeParelho.resumo());
});

router.post('/volume-parelho/analisar', (req, res) => {
  volumeParelho.iniciarAnalise();
  res.status(202).json(volumeParelho.resumo());
});

router.post('/volume-parelho/cancelar', (req, res) => {
  volumeParelho.cancelarAnalise();
  res.json(volumeParelho.resumo());
});

// ---------- Vinhetas de áudio ----------

router.get('/vinhetas', (req, res) => {
  res.json({ config: configuracoes.lerVinhetas(), vinhetas: vinhetas.listar() });
});

router.put('/vinhetas/config', (req, res) => {
  res.json({ config: configuracoes.salvarVinhetas(req.body ?? {}) });
});

router.post('/vinhetas', enviarVinheta, async (req, res) => {
  if (!req.file) throw new ErroApi(400, 'Escolha o arquivo de áudio da vinheta.');
  try {
    const vinheta = await vinhetas.criar({ titulo: req.body?.titulo, arquivoTemporario: req.file.path, nomeOriginal: req.file.originalname });
    res.status(201).json(vinheta);
  } finally {
    apagarArquivo(req.file.path); // se deu erro, o temporário ainda está lá; se deu certo, já foi movido
  }
});

router.put('/vinhetas/:id', (req, res) => {
  res.json(vinhetas.alternar(req.params.id, Boolean(req.body?.ativa)));
});

router.delete('/vinhetas/:id', (req, res) => {
  vinhetas.remover(req.params.id);
  res.json({ sucesso: true });
});

// O painel baixa o áudio com o token e toca no navegador (para o dono conferir o que enviou).
router.get('/vinhetas/:id/audio', (req, res) => {
  const caminho = vinhetas.caminhoAbsoluto(vinhetas.obter(req.params.id));
  if (!caminho) throw new ErroApi(404, 'O arquivo desta vinheta sumiu.');
  res.sendFile(caminho);
});

// ---------- Cartazes do monitor ----------

router.get('/cartazes', (req, res) => {
  res.json({ config: configuracoes.lerCartazes(), cartazes: cartazes.listar() });
});

router.put('/cartazes/config', (req, res) => {
  const ajustes = configuracoes.salvarCartazes(req.body ?? {});
  emitirTodos('cartazes');
  res.json({ config: ajustes });
});

router.post('/cartazes', enviarCartaz, (req, res) => {
  if (!req.file) throw new ErroApi(400, 'Escolha a imagem do cartaz.');
  try {
    const cartaz = cartazes.criar({ ...req.body, arquivoTemporario: req.file.path, nomeOriginal: req.file.originalname });
    emitirTodos('cartazes');
    res.status(201).json(cartaz);
  } finally {
    apagarArquivo(req.file.path);
  }
});

router.put('/cartazes/:id', (req, res) => {
  const cartaz = cartazes.atualizar(req.params.id, req.body ?? {});
  emitirTodos('cartazes');
  res.json(cartaz);
});

router.delete('/cartazes/:id', (req, res) => {
  cartazes.remover(req.params.id);
  emitirTodos('cartazes');
  res.json({ sucesso: true });
});

// ---------- Recados no telão ----------

router.get('/recados', (req, res) => {
  res.json(recados.listarAdmin());
});

router.put('/recados/config', (req, res) => {
  const ajustes = configuracoes.salvarRecados(req.body ?? {});
  emitirTodos('config'); // os celulares mostram ou escondem o botão de recado
  res.json({ config: ajustes });
});

router.post('/recados/:id/aprovar', (req, res) => {
  recados.aprovar(req.params.id);
  res.json({ sucesso: true });
});

router.post('/recados/:id/recusar', (req, res) => {
  recados.recusar(req.params.id);
  res.json({ sucesso: true });
});

// ---------- Vales-música ----------

router.get('/vales', (req, res) => {
  res.json({ lotes: vales.listarLotes() });
});

router.post('/vales', (req, res) => {
  const lote = vales.gerarLote(req.body ?? {});
  res.status(201).json({ ...lote, codigos: lote.codigos.map(vales.formatarCodigo) });
});

router.get('/vales/:lote', (req, res) => {
  res.json({ vales: vales.codigosDoLote(req.params.lote) });
});

router.get('/vales/:lote/qrs', async (req, res) => {
  res.json({ cartoes: await vales.qrsDoLote(req.params.lote) });
});

router.delete('/vales/:lote', (req, res) => {
  res.json({ revogados: vales.revogarLote(req.params.lote) });
});

// ---------- Músicas da internet (yt-dlp) ----------

router.get('/youtube', async (req, res) => {
  res.json(await sobdemanda.situacao());
});

router.put('/youtube/config', async (req, res) => {
  res.json({ config: await sobdemanda.salvarConfig(req.body ?? {}) });
});

router.post('/youtube/verificar', async (req, res) => {
  await youtube.verificar();
  res.json(await sobdemanda.situacao());
});

// Baixa a versão mais nova do próprio yt-dlp (o YouTube muda e o programa precisa acompanhar).
router.post('/youtube/atualizar', async (req, res) => {
  try {
    res.json({ atualizacao: await youtube.atualizar(), ...(await sobdemanda.situacao()) });
  } catch (erro) {
    throw new ErroApi(502, `Não consegui atualizar o yt-dlp: ${erro.message}`);
  }
});

// ---------- Avisos no Telegram ----------

router.get('/alertas', (req, res) => {
  res.json({
    telegram: { token: Boolean(config.telegram.token), configurado: telegram.configurado(), boate_configurada: telegram.boateConfigurada() },
    alertas: configuracoes.lerAlertas(),
    fechamento: configuracoes.lerFechamento(),
    ultimo_fechamento: configuracoes.lerConfig('fechamento_ultimo') || null,
  });
});

router.put('/alertas', (req, res) => {
  const { alertas: tipos, fechamento: ajusteFechamento } = req.body ?? {};
  res.json({
    alertas: configuracoes.salvarAlertas(tipos ?? {}),
    fechamento: configuracoes.salvarFechamento(ajusteFechamento ?? {}),
  });
});

router.post('/alertas/teste', async (req, res) => {
  const para = req.body?.destino === 'boate' ? 'boate' : 'dono';
  res.json(await telegram.enviar(`✅ Teste da ${config.nomeLocal}: o Telegram está funcionando.`, { para }));
});

// Manda já o fechamento das últimas 24 h (para conferir como a mensagem chega).
router.post('/alertas/fechamento', async (req, res) => {
  const resultado = await fechamento.enviarFechamento(fechamento.periodoQueTermina(new Date()), { incluirBoate: Boolean(req.body?.boate) });
  res.json({ dono: resultado.dono, boate: resultado.boate });
});

router.get('/alertas/conversas', async (req, res) => {
  try {
    res.json({ conversas: await telegram.descobrirConversas() });
  } catch (erro) {
    throw new ErroApi(502, `Não consegui falar com o Telegram: ${erro.message}`);
  }
});

// ---------- Sugestões dos clientes ----------

router.get('/sugestoes', (req, res) => {
  res.json({ sugestoes: sugestoes.listar(req.query.status ? String(req.query.status) : 'novo') });
});

router.put('/sugestoes/:id', (req, res) => {
  sugestoes.atualizarStatus(req.params.id, req.body?.status);
  res.json({ sucesso: true });
});

// ---------- Backups e saúde do sistema ----------

router.get('/sistema', async (req, res) => {
  res.json(await sistema.diagnostico());
});

router.get('/backups', (req, res) => {
  res.json({ backups: backup.listarBackups(), pasta: config.backupDir });
});

router.post('/backups', (req, res) => {
  res.status(201).json(backup.fazerBackup());
});

router.get('/backups/:arquivo', (req, res) => {
  const caminho = backup.caminhoDoBackup(req.params.arquivo);
  if (!caminho) throw new ErroApi(404, 'Backup não encontrado');
  res.download(caminho);
});

// ---------- Relatório / fechamento ----------

router.get('/relatorio', (req, res) => {
  res.json(relatorio.gerar(String(req.query.de), String(req.query.ate)));
});

router.get('/relatorio.csv', (req, res) => {
  const resultado = relatorio.gerar(String(req.query.de), String(req.query.ate));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="relatorio-${resultado.de}_${resultado.ate}.csv"`);
  res.send(relatorio.paraCsv(resultado));
});

// ---------- Estatísticas ----------

// `creditos` do histórico é só a parte paga (base da divisão com a boate); `cortesia` é a gratuita.
// Recado que foi ao ar entra no faturamento como a música tocada.
function resumoDesde(desdeIso) {
  const r = relatorio.resumoPeriodo(desdeIso, new Date(Date.now() + 60_000).toISOString());
  return { tocadas: r.tocadas, bruto: r.bruto, usuario: r.usuario, boate: r.boate, arrecadado: r.arrecadado, por_metodo: r.por_metodo, cortesia: r.cortesia, recados: r.recados };
}

const diaLocal = (data) => data.toLocaleDateString('sv-SE');

router.get('/stats', (req, res) => {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const semana = new Date(hoje);
  semana.setDate(semana.getDate() - 6);
  const mes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const quinzena = new Date(hoje);
  quinzena.setDate(quinzena.getDate() - 13);

  const porDia = new Map(db.prepare(`
    SELECT date(tocado_em, 'localtime') AS dia, COUNT(*) AS tocadas, SUM(creditos) AS valor
      FROM historico_reproducao WHERE tocado_em >= ? GROUP BY dia
  `).all(quinzena.toISOString()).map((linha) => [linha.dia, linha]));
  const recadosPorDia = new Map(recados.totaisPorDia(quinzena.toISOString(), new Date(Date.now() + 60_000).toISOString())
    .map((linha) => [linha.dia, linha]));

  const serie = Array.from({ length: 14 }, (_, i) => {
    const dia = new Date(quinzena);
    dia.setDate(quinzena.getDate() + i);
    const chave = diaLocal(dia);
    return {
      dia: chave,
      tocadas: porDia.get(chave)?.tocadas ?? 0,
      valor: (porDia.get(chave)?.valor ?? 0) + (recadosPorDia.get(chave)?.bruto ?? 0),
    };
  });

  res.json({
    divisao_usuario: config.divisaoUsuario,
    periodos: {
      hoje: resumoDesde(hoje.toISOString()),
      semana: resumoDesde(semana.toISOString()),
      mes: resumoDesde(mes.toISOString()),
    },
    serie_diaria: serie,
    musica_mais_tocada: db.prepare(`
      SELECT m.titulo, a.nome AS artista, m.vezes_tocada
        FROM musicas m JOIN cds c ON c.id = m.cd_id JOIN artistas a ON a.id = c.artista_id
       WHERE m.vezes_tocada > 0 ORDER BY m.vezes_tocada DESC LIMIT 1
    `).get() ?? null,
    artista_mais_tocado: db.prepare(`
      SELECT a.nome, SUM(m.vezes_tocada) AS total
        FROM musicas m JOIN cds c ON c.id = m.cd_id JOIN artistas a ON a.id = c.artista_id
       GROUP BY a.id HAVING total > 0 ORDER BY total DESC LIMIT 1
    `).get() ?? null,
    categorias: db.prepare(`
      SELECT cat.nome, cat.icone, cat.cor, SUM(m.vezes_tocada) AS total
        FROM musicas m JOIN cds c ON c.id = m.cd_id JOIN categorias cat ON cat.id = c.categoria_id
       GROUP BY cat.id HAVING total > 0 ORDER BY total DESC
    `).all(),
  });
});

export default router;
