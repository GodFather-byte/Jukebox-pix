import { Router } from 'express';
import { ErroApi } from '../erros.js';
import { cdsDoArtista, obterArtista } from '../services/catalogo.js';

const router = Router();

router.get('/:id/cds', (req, res) => {
  const artista = obterArtista(req.params.id);
  if (!artista) throw new ErroApi(404, 'Artista não encontrado');
  res.json({ artista, cds: cdsDoArtista(artista.id) });
});

export default router;
