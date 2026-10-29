import { Router } from 'express';
import { config } from '../config.js';
import { ErroApi } from '../erros.js';
import { creditarNota, situacaoNoteiro } from '../services/noteiro.js';
import { sessaoDoQuiosque } from '../services/quiosque.js';

const router = Router();

// O que a tela do jukebox precisa para começar: a sessão (saldo) e as formas de pagamento disponíveis.
router.get('/', (req, res) => {
  const teste = config.pagamento.provedor === 'mock';
  const noteiro = situacaoNoteiro();
  res.json({
    sessao: sessaoDoQuiosque(),
    modo_teste: teste,
    metodos: {
      pix: true,
      cartao: teste || Boolean(config.pagamento.mercadopago.terminal),
      nota: teste || noteiro.ativo,
    },
    noteiro: { ativo: noteiro.ativo, conectado: noteiro.conectado },
  });
});

// Só no modo teste: simula uma nota entrando no noteiro.
router.post('/nota-teste', (req, res) => {
  if (config.pagamento.provedor !== 'mock') throw new ErroApi(404, 'Rota não encontrada');
  res.status(201).json(creditarNota(Number(req.body?.valor)));
});

export default router;
