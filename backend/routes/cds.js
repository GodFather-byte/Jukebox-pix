import { Router } from 'express';
import { ErroApi } from '../erros.js';
import { lancamentos, musicasDoCd, obterCd } from '../services/catalogo.js';

const router = Router();

router.get('/lancamentos', (req, res) => {
  res.json({ lancamentos: lancamentos() });
});

router.get('/:id/musicas', (req, res) => {
  const cd = obterCd(req.params.id);
  if (!cd) throw new ErroApi(404, 'CD não encontrado');
  res.json({ cd, musicas: musicasDoCd(cd.id) });
});

export default router;
