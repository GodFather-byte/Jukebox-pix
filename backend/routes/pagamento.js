import { Router } from 'express';
import { config } from '../config.js';
import { ErroApi } from '../erros.js';
import { obterGateway } from '../services/gateways/index.js';
import { cancelar, confirmar, iniciar, obter, sincronizarPorPixId } from '../services/pagamentos.js';

const router = Router();

router.post('/iniciar', async (req, res) => {
  const pagamento = await iniciar({
    valor: Number(req.body?.valor),
    sessionId: req.body?.session_id,
  });
  res.status(201).json({ ...pagamento, pagamento_id: pagamento.id });
});

router.get('/:id', (req, res) => {
  const pagamento = obter(req.params.id);
  if (!pagamento) throw new ErroApi(404, 'Pagamento não encontrado');
  res.json(pagamento);
});

router.post('/:id/cancelar', async (req, res) => {
  res.json(await cancelar(req.params.id));
});

// O corpo do webhook só diz "qual pagamento mudou"; o status real é consultado na API do provedor.
router.post('/webhook', async (req, res) => {
  let pixId;
  try {
    pixId = obterGateway().extrairPixId(req);
  } catch (erro) {
    if (erro instanceof ErroApi) return res.sendStatus(erro.status);
    throw erro;
  }

  res.sendStatus(200);
  if (pixId) {
    sincronizarPorPixId(pixId).catch((erro) => console.error('[webhook]', erro.message));
  }
});

// Só existe em modo de teste: simula o cliente pagando o Pix.
router.post('/mock/confirmar/:id', (req, res) => {
  if (config.pagamento.provedor !== 'mock') throw new ErroApi(404, 'Rota não encontrada');
  if (!obter(req.params.id)) throw new ErroApi(404, 'Pagamento não encontrado');
  confirmar(req.params.id);
  res.json({ sucesso: true });
});

export default router;
