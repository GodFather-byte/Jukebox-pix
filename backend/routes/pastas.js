import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { config } from '../config.js';
import { exigirAdmin } from '../middleware/auth.js';
import { normalizar } from '../database.js';

const router = Router();
router.use(exigirAdmin);

// Lista de extensões de áudio permitidas
const EXT_AUDIO = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg']);

/**
 * Função recursiva para varrer as pastas físicas buscando os arquivos de áudio
 */
function varrerDiretorio(diretorio, termoPesquisa, resultados) {
  let entradas;
  try {
    entradas = fs.readdirSync(diretorio, { withFileTypes: true });
  } catch {
    return; // Ignora pastas inacessíveis
  }

  for (const entrada of entradas) {
    const caminhoCompleto = path.join(diretorio, entrada.name);

    if (entrada.isDirectory()) {
      // Ignora pastas internas do sistema da Jukebox
      if (entrada.name === 'capas' || entrada.name === '_upload') continue;
      
      // Continua buscando nas subpastas
      varrerDiretorio(caminhoCompleto, termoPesquisa, resultados);
    } else if (entrada.isFile()) {
      const ext = path.extname(entrada.name).toLowerCase();
      
      if (EXT_AUDIO.has(ext)) {
        // Verifica se o termo pesquisado está no nome do arquivo ou no caminho
        const caminhoRelativo = path.relative(config.musicasDir, caminhoCompleto);
        const textoBusca = normalizar(caminhoRelativo);
        
        if (textoBusca.includes(termoPesquisa)) {
          const stats = fs.statSync(caminhoCompleto);
          resultados.push({
            nome_arquivo: entrada.name,
            caminho_relativo: caminhoRelativo.split(path.sep).join('/'),
            pasta: path.dirname(caminhoRelativo).split(path.sep).join('/'),
            tamanho_mb: (stats.size / (1024 * 1024)).toFixed(2)
          });
        }
      }
    }
  }
}

// Rota GET /api/admin/pastas/buscar?q=termo
router.get('/buscar', (req, res) => {
  const termo = normalizar(String(req.query.q || ''));
  
  if (termo.length < 2) {
    return res.json({ resultados: [] });
  }

  const resultados = [];
  varrerDiretorio(config.musicasDir, termo, resultados);

  // Ordena por pasta e nome do arquivo, retornando no máximo 100 resultados para não travar
  resultados.sort((a, b) => a.caminho_relativo.localeCompare(b.caminho_relativo));
  res.json({ resultados: resultados.slice(0, 100), total_encontrado: resultados.length });
});

export default router;

