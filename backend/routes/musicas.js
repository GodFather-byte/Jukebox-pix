import { Router } from 'express';
import { buscar, porIds, sugestoes, topTocadas } from '../services/catalogo.js';

const router = Router();

router.get('/sugestoes', (req, res) => {
  res.json({ sugestoes: sugestoes(4) });
});

router.get('/top-tocadas', (req, res) => {
  const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 5, 1), 50);
  res.json({ top: topTocadas(limite) });
});

router.get('/buscar', (req, res) => {
  const termo = String(req.query.q ?? '').slice(0, 80);
  const categoria = req.query.categoria ? String(req.query.categoria) : null;
  res.json({ resultados: buscar(termo, categoria) });
});

router.get('/por-ids', (req, res) => {
  const ids = String(req.query.ids ?? '').split(',').slice(0, 30);
  res.json({ musicas: porIds(ids) });
});

export default router;
