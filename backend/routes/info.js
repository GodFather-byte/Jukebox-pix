import { Router } from 'express';
import { config } from '../config.js';
import { conectar } from '../events.js';
import { lerRegras } from '../services/configuracoes.js';

const router = Router();

router.get('/info', (req, res) => {
  res.json({
    nome: config.nomeLocal,
    modo_teste: config.pagamento.provedor === 'mock',
    valores: config.valoresPix,
    valor_min: config.valorMin,
    valor_max: config.valorMax,
    sessao_ttl_min: config.sessaoTtlMin,
  });
});

// Regras da casa que o app precisa conhecer (vendas abertas, prioridade, limites, aviso).
router.get('/config', (req, res) => {
  res.json(lerRegras());
});

// ?tela=1 identifica o monitor (conta como "telão ligado" para o recado pago).
router.get('/eventos', (req, res) => {
  conectar(req, res, req.query.session_id ? String(req.query.session_id) : null, { tela: req.query.tela === '1' });
});

export default router;
