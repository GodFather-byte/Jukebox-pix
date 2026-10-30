import { Router } from 'express';
import { config } from '../config.js';
import { ErroApi } from '../erros.js';
import { creditarNota, pulsoDeTeclado, situacaoNoteiro } from '../services/noteiro.js';
import { sessaoDoQuiosque } from '../services/quiosque.js';
import { fecharRelogio, lerRelogio } from '../services/relogio.js';
import { enviarRelatorio } from '../services/central.js';

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
    teclado: { perfil: config.tecladoPerfil, tecla_credito: config.noteiro.tipo === 'teclado' ? config.noteiro.tecla : null },
  });
});

// A placa da máquina mandou a tecla de crédito (um pulso do noteiro, moedeiro ou chave de créditos).
// Só existe com NOTEIRO=teclado; o servidor só atende o próprio computador.
router.post('/pulso', (req, res) => {
  if (!pulsoDeTeclado()) throw new ErroApi(404, 'Rota não encontrada');
  res.status(202).json({ ok: true });
});

// Menu do operador (botão de dentro da máquina): relógio total/parcial e fechamento do caixa.
router.get('/relogio', (req, res) => {
  res.json(lerRelogio());
});

router.post('/relogio/fechar', (req, res) => {
  const relogio = fecharRelogio();
  enviarRelatorio(); // o fechamento chega no app na hora (sem esperar as 6 h); falha não atrapalha o caixa
  res.json(relogio);
});

// Só no modo teste: simula uma nota entrando no noteiro.
router.post('/nota-teste', (req, res) => {
  if (config.pagamento.provedor !== 'mock') throw new ErroApi(404, 'Rota não encontrada');
  res.status(201).json(creditarNota(Number(req.body?.valor)));
});

export default router;
