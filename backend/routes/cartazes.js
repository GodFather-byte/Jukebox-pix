import { Router } from 'express';
import * as cartazes from '../services/cartazes.js';

const router = Router();

// O monitor busca os cartazes que valem hoje (vazio se o recurso estiver desligado).
router.get('/', (req, res) => {
  res.json(cartazes.publico());
});

// O monitor avisa cada vez que mostra um cartaz.
router.post('/:id/exibido', (req, res) => {
  res.json({ contado: cartazes.registrarExibicao(req.params.id) });
});

export default router;
