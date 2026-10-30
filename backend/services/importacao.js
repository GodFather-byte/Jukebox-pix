import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { db, slug } from '../database.js';
import { ErroApi } from '../erros.js';
import { criarCd, EXT_AUDIO, EXT_IMAGEM, validarPreco } from './biblioteca.js';

fs.mkdirSync(config.importDir, { recursive: true });

const EXT_VIDEO = new Set(['.mp4', '.mpg', '.mpeg', '.avi', '.mkv', '.vob']);
const NOMES_DE_CAPA =['capa', 'cover', 'folder', 'front', 'albumart'];
const CORES = ['#FF1493', '#00D4FF', '#F5B700', '#A855F7', '#22C55E', '#EF4444', '#6366F1', '#FF8A00'];

const natural = (a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
const extensao = (nome) => path.extname(nome).toLowerCase();

// "2019 - Nome do CD" e "Nome do CD (2019)" viram título + ano.
function separarAno(nome) {
  let achou = nome.match(/^\s*((?:19|20)\d{2})\s*[-–_.]\s*(.+)$/);
  if (achou) return { ano: Number(achou[1]), titulo: achou[2].trim() };
  achou = nome.match(/^(.*?)\s*[([]\s*((?:19|20)\d{2})\s*[)\]]\s*$/);
  if (achou) return { ano: Number(achou[2]), titulo: achou[1].trim() };
  return { ano: null, titulo: nome.trim() };
}

// Pasta única no formato de outras jukeboxes: "ARTISTA - CD 1" vira artista + CD.
// Sem " - " no nome (ex.: "Coletanea Funk 4"), o nome da pasta vale para os dois.
export function separarArtista(nome) {
  const partes = nome.split(/\s+[-–]\s+/);
  if (partes.length < 2 || !partes[0].trim()) return { artista: nome.trim(), nomeCd: nome.trim() };
  return { artista: partes[0].trim(), nomeCd: partes.slice(1).join(' - ').trim() };
}

/**
 * Procura CDs em config.importDir. A pasta de um CD é a que tem arquivos de áudio dentro:
 *   Artista - CD/faixas            (uma pasta só, como o acervo de outras jukeboxes)
 *   Artista/CD/faixas              (a categoria é escolhida na tela)
 *   Categoria/Artista/CD/faixas    (a categoria vem do nome da pasta)
 * origem 'externo' procura em config.acervoExternoDir (acervo de outra jukebox, só leitura).
 * Só lista; nada é movido aqui.
 */
export function escanear(origem = 'importar') {
  const raiz = pastaDaOrigem(origem);
  const cds = [];
  const ignorados = [];
  const titulosDoArtista = db.prepare('SELECT titulo FROM cds WHERE artista_id = ?');

  function registrar(dir, segmentos, audios, entradas) {
    if (!segmentos.length) {
      ignorados.push({ chave: '(raiz da pasta)', motivo: 'Músicas soltas: coloque-as dentro de uma pasta Artista - CD.' });
      return;
    }

    let categoriaPasta = null;
    let artista;
    let nomeCd;
    if (segmentos.length === 1) ({ artista, nomeCd } = separarArtista(segmentos[0]));
    else if (segmentos.length === 3) [categoriaPasta, artista, nomeCd] = segmentos;
    else [artista, nomeCd] = segmentos;
    const { titulo, ano } = separarAno(nomeCd);
    const imagens = entradas.filter((e) => e.isFile() && EXT_IMAGEM.has(extensao(e.name))).map((e) => e.name).sort(natural);
    const capa = imagens.find((nome) => NOMES_DE_CAPA.includes(path.parse(nome).name.toLowerCase())) ?? imagens[0] ?? null;
    const jaExiste = titulosDoArtista.all(slug(artista)).some((cd) => slug(cd.titulo) === slug(titulo));

    cds.push({ chave: segmentos.join('/'), dir, categoriaPasta, artista, titulo, ano, audios, capa, jaExiste });
  }

  function andar(dir, segmentos) {
    let entradas;
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    // Dirent de link simbólico não é arquivo nem pasta: links são ignorados de propósito.
    const audios = entradas.filter((e) => e.isFile() && EXT_AUDIO.has(extensao(e.name))).map((e) => e.name).sort(natural);
    if (audios.length) registrar(dir, segmentos, audios, entradas);
    else if (segmentos.length && entradas.some((e) => e.isFile() && EXT_VIDEO.has(extensao(e.name)))) {
      ignorados.push({ chave: segmentos.join('/'), motivo: 'Só tem clipes (vídeo): ainda não são importados.' });
    }

    if (segmentos.length < 3) {
      for (const entrada of entradas) {
        if (entrada.isDirectory() && !entrada.name.startsWith('.')) andar(path.join(dir, entrada.name), [...segmentos, entrada.name]);
      }
    }
  }

  andar(raiz, []);
  cds.sort((a, b) => natural(a.chave, b.chave));
  return { cds, ignorados };
}

function pastaDaOrigem(origem) {
  if (origem !== 'externo') return config.importDir;
  if (!config.acervoExternoDir) throw new ErroApi(400, 'Nenhuma pasta de acervo de outra jukebox foi configurada.');
  if (!fs.existsSync(config.acervoExternoDir)) {
    throw new ErroApi(400, `Pasta do acervo não encontrada (${config.acervoExternoDir}). O HD está ligado?`);
  }
  return config.acervoExternoDir;
}

// O que o navegador recebe: sem caminhos do disco além da própria pasta procurada.
export function listar(origem = 'importar') {
  const { cds, ignorados } = escanear(origem);
  return {
    origem: origem === 'externo' ? 'externo' : 'importar',
    externo_configurado: Boolean(config.acervoExternoDir),
    pasta: pastaDaOrigem(origem),
    cds: cds.map((cd) => ({
      chave: cd.chave,
      categoria_pasta: cd.categoriaPasta,
      artista: cd.artista,
      titulo: cd.titulo,
      ano: cd.ano,
      faixas: cd.audios.length,
      tem_capa: Boolean(cd.capa),
      ja_existe: cd.jaExiste,
    })),
    ignorados,
  };
}

function garantirCategoria(nome) {
  const id = slug(nome);
  if (!id) throw new ErroApi(400, 'Nome de categoria inválido na pasta');
  if (!db.prepare('SELECT 1 FROM categorias WHERE id = ?').get(id)) {
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM categorias').get();
    db.prepare('INSERT INTO categorias (id, nome, icone, cor) VALUES (?, ?, ?, ?)').run(id, nome.trim(), '🎵', CORES[total % CORES.length]);
  }
  return id;
}

function limparPastasVazias(dir, ehRaiz = true) {
  try {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entrada.isDirectory()) limparPastasVazias(path.join(dir, entrada.name), false);
    }
    if (!ehRaiz && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  } catch { /* melhor esforço */ }
}

/**
 * Importa os CDs escolhidos. As chaves vêm do navegador, mas só valem se baterem com uma pasta
 * que o escaneamento acabou de achar: nenhum caminho do cliente é usado no disco.
 * Cada CD é independente: um que falha não derruba os outros (e seus arquivos ficam onde estavam).
 * Do acervo externo, as faixas ficam onde estão e só o cadastro é criado.
 */
export async function importar({ chaves, categoriaId, status, preco = 1, origem = 'importar' }) {
  const externo = origem === 'externo';
  if (!Array.isArray(chaves) || !chaves.length) throw new ErroApi(400, 'Selecione ao menos um CD.');
  validarPreco(preco); // erro de preço vale para o lote todo, antes de mover qualquer arquivo

  const porChave = new Map(escanear(externo ? 'externo' : 'importar').cds.map((cd) => [cd.chave, cd]));
  const importados = [];
  const erros = [];

  for (const chave of new Set(chaves)) {
    const cd = porChave.get(chave);
    if (!cd) { erros.push({ chave, erro: 'Pasta não encontrada (talvez já tenha sido importada).' }); continue; }
    if (cd.jaExiste) { erros.push({ chave, erro: 'Já existe um CD com esse nome para este artista.' }); continue; }
    if (!cd.categoriaPasta && !categoriaId) { erros.push({ chave, erro: 'Escolha a categoria dos CDs.' }); continue; }

    try {
      const resultado = await criarCd({
        titulo: cd.titulo,
        ano: cd.ano,
        categoriaId: cd.categoriaPasta ? garantirCategoria(cd.categoriaPasta) : categoriaId,
        artistaNome: cd.artista,
        status,
        preco,
        capa: cd.capa ? { caminho: path.join(cd.dir, cd.capa), nomeOriginal: cd.capa } : null,
        faixas: cd.audios.map((nome) => ({ caminho: path.join(cd.dir, nome), nomeOriginal: nome })),
        detalheLog: `${externo ? 'acervo de outra jukebox, tocando de onde está' : 'importação em lote'} (${cd.audios.length} música(s))`,
        manterNoLugar: externo,
      });
      importados.push({ chave, ...resultado });
    } catch (erro) {
      if (!(erro instanceof ErroApi)) console.error(`[importacao] ${chave}:`, erro);
      erros.push({ chave, erro: erro instanceof ErroApi ? erro.message : `Falha inesperada: ${erro.message}` });
    }
  }

  if (!externo) limparPastasVazias(config.importDir);
  return { importados, erros };
}
