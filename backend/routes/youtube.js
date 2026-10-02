import { Router } from 'express';
import * as sobdemanda from '../services/sobdemanda.js';

const router = Router();

// Pesquisa na internet (só funciona se o dono ligou o recurso e o yt-dlp está instalado).
router.get('/buscar', async (req, res) => {
  res.json(await sobdemanda.buscar(String(req.query.session_id ?? ''), String(req.query.q ?? ''), req.ip));
});

// 201 = a música já estava na casa e entrou na fila; 202 = cobrado, está sendo baixada (o celular acompanha pelo evento "youtube").
router.post('/comprar', async (req, res) => {
  const resultado = await sobdemanda.comprar(req.body?.session_id, req.body?.video_id, req.ip);
  res.status(resultado.pronto ? 201 : 202).json({ sucesso: true, ...resultado });
});

// Os pedidos desta sessão (o id da sessão funciona como senha).
router.get('/pedidos/:session_id', (req, res) => {
  res.json({ pedidos: sobdemanda.listarDaSessao(req.params.session_id) });
});

export default router;
