import { Router } from 'express';
import { emitirSessao } from '../events.js';
import { obterSessao } from '../services/sessoes.js';
import * as vales from '../services/vales.js';

const router = Router();

router.post('/resgatar', (req, res) => {
  const sessionId = req.body?.session_id;
  const resultado = vales.resgatar(sessionId, req.body?.codigo, { ip: req.ip });
  emitirSessao(sessionId, 'sessao', obterSessao(sessionId));
  res.json({ sucesso: true, ...resultado });
});

export default router;
