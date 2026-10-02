import { Router } from 'express';
import { ErroApi } from '../erros.js';
import { pedidosRecentes } from '../services/catalogo.js';
import { criarSessao, obterSessao } from '../services/sessoes.js';

const router = Router();

router.post('/', (req, res) => {
  res.status(201).json(criarSessao());
});

router.get('/:id', (req, res) => {
  const sessao = obterSessao(req.params.id);
  if (!sessao) throw new ErroApi(404, 'Sessão não encontrada');
  res.json(sessao);
});

router.get('/:id/pedidos', (req, res) => {
  if (!obterSessao(req.params.id)) throw new ErroApi(404, 'Sessão não encontrada');
  res.json({ pedidos: pedidosRecentes(req.params.id) });
});

export default router;
