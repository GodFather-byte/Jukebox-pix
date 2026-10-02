import { Router } from 'express';
import { emitirSessao } from '../events.js';
import * as recados from '../services/recados.js';
import { obterSessao } from '../services/sessoes.js';

const router = Router();

// O que está no telão agora (o monitor consulta ao abrir e ao reconectar).
router.get('/atual', (req, res) => {
  res.json({ atual: recados.noAr() });
});

router.post('/', (req, res) => {
  const sessionId = req.body?.session_id;
  const recado = recados.enviar(sessionId, req.body?.texto);
  emitirSessao(sessionId, 'sessao', obterSessao(sessionId)); // outras abas do mesmo celular atualizam o saldo
  res.status(201).json(recado);
});

// Os últimos recados desta sessão (o id da sessão funciona como senha).
router.get('/sessao/:session_id', (req, res) => {
  res.json({ recados: recados.listarDaSessao(req.params.session_id) });
});

export default router;
