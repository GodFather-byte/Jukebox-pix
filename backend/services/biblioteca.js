import fs from 'node:fs';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import { config } from '../config.js';
import { agora, db, novoId, registrarLogCd, slug } from '../database.js';
import { ErroApi } from '../erros.js';
import { agendarAnalise } from './volume.js';

export const EXT_AUDIO = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg']);
export const EXT_IMAGEM = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export const capasDir = path.join(config.musicasDir, 'capas');
fs.mkdirSync(capasDir, { recursive: true });

const DIA_MS = 24 * 60 * 60_000;
const LEITURAS_SIMULTANEAS = 6;

const nomeSeguro = (texto) => slug(texto).slice(0, 60) || 'faixa';
export const apagarArquivo = (arquivo) => fs.rmSync(arquivo, { force: true });

// Preço de cada música do CD em créditos (1 crédito = R$ 1,00). Vazio vale 1.
export function validarPreco(valor) {
  if (valor === undefined || valor === null || valor === '') return 1;
  const preco = Number(valor);
  if (!Number.isInteger(preco) || preco < 1 || preco > 20) {
    throw new ErroApi(400, 'Preço por música: informe um número inteiro de 1 a 20 créditos.');
  }
  return preco;
}

// rename é instantâneo; entre discos diferentes (EXDEV) cai para copiar + apagar.
export function moverArquivo(origem, destino) {
  try {
    fs.renameSync(origem, destino);
  } catch (erro) {
    if (erro.code !== 'EXDEV') throw erro;
    fs.copyFileSync(origem, destino);
    fs.unlinkSync(origem);
  }
}

export function criarArtista(nome, categoriaId) {
  const id = slug(nome);
  if (!id) throw new ErroApi(400, 'Informe o nome do artista');
  const existente = db.prepare('SELECT id FROM artistas WHERE id = ?').get(id);
  if (existente) return existente.id;
  db.prepare('INSERT INTO artistas (id, nome, categoria_id, criado_em) VALUES (?, ?, ?, ?)')
    .run(id, String(nome).trim(), categoriaId, agora());
  return id;
}

// A ordem das faixas vem da tag; sem tag, do número no começo do nome ("01 - Titulo.mp3").
async function lerFaixa(faixa, indice) {
  const nome = path.parse(faixa.nomeOriginal).name;
  const numeroNoNome = Number(nome.match(/^\s*(\d+)\s*[-_.)]/)?.[1]) || null;
  const tituloDoNome = nome.replace(/^\s*\d+\s*[-_.)]\s*/, '').trim() || nome;
  try {
    const { common, format } = await parseFile(faixa.caminho, { duration: true });
    return {
      ...faixa,
      indice,
      titulo: (faixa.tituloManual || common.title || tituloDoNome).trim(),
      duracao: Math.round(format.duration || 0) || null,
      numero: common.track?.no ?? numeroNoNome,
      ano: common.year ?? null,
    };
  } catch {
    return { ...faixa, indice, titulo: (faixa.tituloManual || tituloDoNome).trim(), duracao: null, numero: numeroNoNome, ano: null };
  }
}

// Lê as tags em pequenos lotes: um CD grande não abre centenas de arquivos ao mesmo tempo.
async function lerFaixas(faixas) {
  const lidas = [];
  for (let i = 0; i < faixas.length; i += LEITURAS_SIMULTANEAS) {
    const lote = faixas.slice(i, i + LEITURAS_SIMULTANEAS);
    lidas.push(...await Promise.all(lote.map((faixa, j) => lerFaixa(faixa, i + j))));
  }
  return lidas;
}

// Devolve cada arquivo ao lugar de origem: quem importou da pasta não pode perder a música por um erro.
function desfazerMovimentos(movimentos, pastasCriadas) {
  for (const { origem, destino } of movimentos.reverse()) {
    try { moverArquivo(destino, origem); } catch { /* melhor esforço */ }
  }
  for (const pasta of pastasCriadas.reverse()) {
    try { fs.rmdirSync(pasta); } catch { /* não está vazia */ }
  }
}

/**
 * Cria um CD com suas músicas, movendo os arquivos para dentro da biblioteca.
 * capa:   { caminho, nomeOriginal } | null
 * faixas: [{ caminho, nomeOriginal, tituloManual? }]
 * status: 'novo' (fica em LANÇAMENTOS por LANCAMENTO_DIAS) ou 'lancado' (vai direto pra categoria)
 * preco:  créditos cobrados por música deste CD (padrão 1)
 * manterNoLugar: as faixas tocam de onde estão (acervo de outra jukebox); só a capa é copiada.
 */
export async function criarCd({ titulo, ano, categoriaId, artistaId, artistaNome, status = 'novo', preco = 1, capa = null, faixas, detalheLog, manterNoLugar = false }) {
  const tituloLimpo = String(titulo ?? '').trim();
  if (!tituloLimpo) throw new ErroApi(400, 'Informe o título do CD');
  if (!faixas?.length) throw new ErroApi(400, 'Envie ao menos uma música');
  const precoFinal = validarPreco(preco);
  if (!db.prepare('SELECT 1 FROM categorias WHERE id = ?').get(categoriaId)) throw new ErroApi(400, 'Categoria inválida');

  let idArtista = artistaId || null;
  if (idArtista) {
    if (!db.prepare('SELECT 1 FROM artistas WHERE id = ?').get(idArtista)) throw new ErroApi(400, 'Artista inválido');
  } else if (!slug(artistaNome)) {
    throw new ErroApi(400, 'Informe o nome do artista');
  }

  const lidas = await lerFaixas(faixas);
  lidas.sort((a, b) => (a.numero ?? 999) - (b.numero ?? 999) || a.indice - b.indice);

  const cdId = novoId();
  const pasta = path.join(nomeSeguro(idArtista ?? artistaNome), `${nomeSeguro(tituloLimpo)}-${cdId.slice(0, 8)}`);
  const movimentos = [];
  const pastasCriadas = [];
  let capaCopiada = null;

  try {
    if (!manterNoLugar) {
      for (const dir of [path.join(config.musicasDir, path.dirname(pasta)), path.join(config.musicasDir, pasta)]) {
        if (!fs.existsSync(dir)) pastasCriadas.push(dir);
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    let capaNome = null;
    if (capa) {
      capaNome = `${cdId}${path.extname(capa.nomeOriginal).toLowerCase()}`;
      const destino = path.join(capasDir, capaNome);
      if (manterNoLugar) {
        fs.copyFileSync(capa.caminho, destino);
        capaCopiada = destino;
      } else {
        moverArquivo(capa.caminho, destino);
        movimentos.push({ origem: capa.caminho, destino });
      }
    }

    const musicas = lidas.map((faixa, i) => {
      if (manterNoLugar) {
        return { id: novoId(), titulo: faixa.titulo, duracao: faixa.duracao, arquivo: path.resolve(faixa.caminho).split(path.sep).join('/') };
      }
      const extensao = path.extname(faixa.nomeOriginal).toLowerCase();
      const arquivo = path.join(pasta, `${String(i + 1).padStart(2, '0')}-${nomeSeguro(faixa.titulo)}${extensao}`);
      const destino = path.join(config.musicasDir, arquivo);
      moverArquivo(faixa.caminho, destino);
      movimentos.push({ origem: faixa.caminho, destino });
      return { id: novoId(), titulo: faixa.titulo, duracao: faixa.duracao, arquivo: arquivo.split(path.sep).join('/') };
    });

    const agoraIso = agora();
    const lancadoJa = status === 'lancado';
    const dataLancamento = lancadoJa ? agoraIso : new Date(Date.now() + config.lancamentoDias * DIA_MS).toISOString();
    const anoFinal = Number(ano) || lidas.find((f) => f.ano)?.ano || null;

    db.transaction(() => {
      const artista = idArtista ?? criarArtista(artistaNome, categoriaId);
      db.prepare(`
        INSERT INTO cds (id, titulo, artista_id, categoria_id, capa, ano, status, data_criacao, data_lancamento, criado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(cdId, tituloLimpo, artista, categoriaId, capaNome, anoFinal, lancadoJa ? 'lancado' : 'novo', agoraIso, dataLancamento, agoraIso);

      const inserir = db.prepare(`
        INSERT INTO musicas (id, titulo, cd_id, duracao, creditos, arquivo, criado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const m of musicas) inserir.run(m.id, m.titulo, cdId, m.duracao, precoFinal, m.arquivo, agoraIso);

      registrarLogCd(cdId, tituloLimpo, 'criado', detalheLog
        ?? `${musicas.length} música(s); ${lancadoJa ? 'direto na categoria' : `sai de LANÇAMENTOS em ${config.lancamentoDias} dias`}${precoFinal > 1 ? `; ${precoFinal} créditos por música` : ''}`);
    })();

    agendarAnalise(); // volume parelho: mede as faixas novas em segundo plano (se ligado e com ffmpeg)

    return { id: cdId, status: lancadoJa ? 'lancado' : 'novo', data_lancamento: dataLancamento, total_musicas: musicas.length };
  } catch (erro) {
    desfazerMovimentos(movimentos, pastasCriadas);
    if (capaCopiada) apagarArquivo(capaCopiada);
    throw erro;
  }
}
