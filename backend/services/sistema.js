import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { db } from '../database.js';
import * as player from '../player.js';
import { listarBackups, situacaoDaCopiaExtra } from './backup.js';

const tamanhoDoArquivo = (caminho) => {
  try { return fs.statSync(caminho).size; } catch { return 0; }
};

// Soma o tamanho dos arquivos da pasta (só leitura de metadados; roda quando o dono abre a aba).
function tamanhoDaPasta(pasta) {
  let total = 0;
  const pendentes = [pasta];
  while (pendentes.length) {
    const atual = pendentes.pop();
    let entradas;
    try { entradas = fs.readdirSync(atual, { withFileTypes: true }); } catch { continue; }
    for (const entrada of entradas) {
      const caminho = path.join(atual, entrada.name);
      if (entrada.isDirectory()) pendentes.push(caminho);
      else if (entrada.isFile()) total += tamanhoDoArquivo(caminho);
    }
  }
  return total;
}

async function testarInternet() {
  try {
    await fetch('https://api.mercadopago.com', { method: 'HEAD', signal: AbortSignal.timeout(4000) });
    return true;
  } catch {
    return false;
  }
}

function espacoEmDisco() {
  try {
    const { bsize, bavail, blocks } = fs.statfsSync(config.musicasDir);
    return { livre: bsize * bavail, total: bsize * blocks };
  } catch {
    return null;
  }
}

// Músicas cadastradas cujo arquivo não existe mais: o cliente pagaria e a faixa falharia (com reembolso).
// As que o dono já ocultou não atrapalham ninguém, então contam à parte.
function listarSemArquivo() {
  const todas = db.prepare(`
    SELECT m.id, m.titulo, m.arquivo, m.oculta, c.titulo AS cd, a.nome AS artista
      FROM musicas m JOIN cds c ON c.id = m.cd_id JOIN artistas a ON a.id = c.artista_id
  `).all();
  return { todas, faltando: todas.filter((m) => !fs.existsSync(path.resolve(config.musicasDir, m.arquivo))) };
}

function musicasSemArquivo() {
  const { todas, faltando } = listarSemArquivo();
  const visiveis = faltando.filter((m) => !m.oculta);
  return {
    total: visiveis.length,
    ocultas: faltando.length - visiveis.length,
    exemplos: visiveis.slice(0, 20),
    verificadas: todas.length,
  };
}

// Esconde do cliente (e da playlist automática) toda música sem arquivo. Dá pra reexibir depois.
export function ocultarSemArquivo() {
  const ids = listarSemArquivo().faltando.filter((m) => !m.oculta).map((m) => m.id);
  const ocultar = db.prepare('UPDATE musicas SET oculta = 1 WHERE id = ?');
  db.transaction(() => ids.forEach((id) => ocultar.run(id)))();
  return ids.length;
}

export async function diagnostico() {
  const provedor = config.pagamento.provedor;
  const estadoPlayer = player.estado();
  const um = (sql) => db.prepare(sql).get().n;

  return {
    versao_node: process.version,
    ligado_ha_segundos: Math.round(process.uptime()),
    player: { backend: estadoPlayer.backend, pausado: estadoPlayer.pausado, simulado: estadoPlayer.backend === 'sim' },
    pagamento: {
      provedor,
      modo_teste: provedor === 'mock',
      internet: provedor === 'mock' ? null : await testarInternet(),
      pendentes: um("SELECT COUNT(*) n FROM pagamentos WHERE status = 'pendente'"),
    },
    disco: espacoEmDisco(),
    tamanhos: {
      banco: tamanhoDoArquivo(config.dbPath) + tamanhoDoArquivo(`${config.dbPath}-wal`),
      musicas: tamanhoDaPasta(config.musicasDir),
    },
    acervo: {
      cds: um('SELECT COUNT(*) n FROM cds'),
      musicas: um('SELECT COUNT(*) n FROM musicas'),
      sem_arquivo: musicasSemArquivo(),
    },
    atividade: {
      fila: um("SELECT COUNT(*) n FROM fila WHERE status IN ('aguardando', 'tocando')"),
      sessoes_com_saldo: um("SELECT COUNT(*) n FROM sessoes WHERE (saldo > 0 OR saldo_cortesia > 0) AND id <> 'sistema'"),
    },
    backups: listarBackups().slice(0, 5),
    pasta_backups: config.backupDir,
    backup_copia: situacaoDaCopiaExtra(),
  };
}
