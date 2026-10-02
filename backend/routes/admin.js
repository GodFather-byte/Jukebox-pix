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
import { apagarArquivo, capasDir, criarArtista, criarCd, EXT_AUDIO, EXT_IMAGEM } from '../services/biblioteca.js';
import * as configuracoes from '../services/configuracoes.js';
import * as cortesia from '../services/cortesia.js';
import { listar, remover } from '../services/fila.js';
import * as importacao from '../services/importacao.js';
import * as relatorio from '../services/relatorio.js';
import { obterSessao } from '../services/sessoes.js';
import * as sistema from '../services/sistema.js';
import * as sugestoes from '../services/sugestoes.js';

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
           c.artista_id, c.categoria_id,
           a.nome AS artista, cat.nome AS categoria, cat.icone,
           COUNT(m.id) AS total_musicas, COALESCE(SUM(m.vezes_tocada), 0) AS vezes_tocadas
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
  res.json(importacao.listar());
});

router.post('/importacao', async (req, res) => {
  const { chaves, categoria_id: categoriaId, status } = req.body ?? {};
  const resultado = await importacao.importar({
    chaves,
    categoriaId,
    status: status === 'lancado' ? 'lancado' : 'novo',
  });
  if (resultado.importados.length) emitirTodos('lancamentos');
  res.json(resultado);
});

router.put('/cds/:id', (req, res) => {
  const cd = db.prepare('SELECT * FROM cds WHERE id = ?').get(req.params.id);
  if (!cd) throw new ErroApi(404, 'CD não encontrado');

  const { titulo = cd.titulo, ano = cd.ano, categoria_id: categoriaId = cd.categoria_id, artista_id: artistaId = cd.artista_id, status = cd.status } = req.body ?? {};
  if (!['novo', 'lancado'].includes(status)) throw new ErroApi(400, 'Status inválido');
  if (!db.prepare('SELECT 1 FROM categorias WHERE id = ?').get(categoriaId)) throw new ErroApi(400, 'Categoria inválida');
  if (!db.prepare('SELECT 1 FROM artistas WHERE id = ?').get(artistaId)) throw new ErroApi(400, 'Artista inválido');

  let dataLancamento = cd.data_lancamento;
  if (status !== cd.status) {
    dataLancamento = status === 'novo'
      ? new Date(Date.now() + config.lancamentoDias * 24 * 60 * 60_000).toISOString()
      : agora();
  }

  db.prepare('UPDATE cds SET titulo = ?, ano = ?, categoria_id = ?, artista_id = ?, status = ?, data_lancamento = ? WHERE id = ?')
    .run(titulo, ano ? Number(ano) : null, categoriaId, artistaId, status, dataLancamento, cd.id);
  registrarLogCd(cd.id, titulo, 'editado', status !== cd.status ? `status: ${cd.status} → ${status}` : null);

  emitirTodos('lancamentos');
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

// ---------- Playlist automática ----------

router.put('/automatico', (req, res) => {
  const { ativo, interrompe } = req.body ?? {};
  const ajustes = configuracoes.salvarAutomatico({ ativo, interrompe });
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
function resumoDesde(desdeIso) {
  const { tocadas, bruto, gratis } = db.prepare(`
    SELECT COUNT(*) AS tocadas, COALESCE(SUM(creditos), 0) AS bruto, COALESCE(SUM(cortesia), 0) AS gratis
      FROM historico_reproducao WHERE tocado_em >= ?
  `).get(desdeIso);
  const { arrecadado } = db.prepare(
    "SELECT COALESCE(SUM(valor), 0) AS arrecadado FROM pagamentos WHERE status = 'confirmado' AND confirmado_em >= ?",
  ).get(desdeIso);
  const usuario = (bruto * config.divisaoUsuario) / 100;
  return { tocadas, bruto, usuario, boate: bruto - usuario, arrecadado, cortesia: gratis };
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

  const serie = Array.from({ length: 14 }, (_, i) => {
    const dia = new Date(quinzena);
    dia.setDate(quinzena.getDate() + i);
    const chave = diaLocal(dia);
    return { dia: chave, tocadas: porDia.get(chave)?.tocadas ?? 0, valor: porDia.get(chave)?.valor ?? 0 };
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
