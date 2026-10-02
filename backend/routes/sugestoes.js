import { Router } from 'express';
import { sugerir } from '../services/sugestoes.js';

const router = Router();

router.post('/', (req, res) => {
  const resultado = sugerir(req.body?.session_id, req.body?.texto);
  res.status(201).json({ sucesso: true, ...resultado });
});

export default router;
