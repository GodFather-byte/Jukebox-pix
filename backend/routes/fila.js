import { Router } from 'express';
import { emitirSessao, emitirTodos } from '../events.js';
import { acordar } from '../player.js';
import { adicionar, listar } from '../services/fila.js';
import { obterSessao } from '../services/sessoes.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(listar());
});

router.get('/:session_id', (req, res) => {
  res.json(listar(req.params.session_id));
});

router.post('/adicionar', (req, res) => {
  const { session_id: sessionId, musica_id: musicaId, prioridade } = req.body ?? {};
  const { saldo, premio } = adicionar(sessionId, musicaId, { prioridade: Boolean(prioridade) });

  emitirTodos('fila');
  emitirSessao(sessionId, 'sessao', obterSessao(sessionId));
  acordar();

  res.status(201).json({ sucesso: true, saldo, premio });
});

export default router;
