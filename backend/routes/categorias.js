import { Router } from 'express';
import { ErroApi } from '../erros.js';
import { artistasDaCategoria, listarCategorias, obterCategoria } from '../services/catalogo.js';

const router = Router();

router.get('/', (req, res) => {
  res.json({ categorias: listarCategorias() });
});

router.get('/:id/artistas', (req, res) => {
  const categoria = obterCategoria(req.params.id);
  if (!categoria) throw new ErroApi(404, 'Categoria não encontrada');
  res.json({ categoria, artistas: artistasDaCategoria(categoria.id) });
});

export default router;
