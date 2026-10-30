import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';
import { ErroApi } from '../../erros.js';

const API = 'https://api.mercadopago.com';
const cfg = config.pagamento.mercadopago;

// No aplicativo desktop a saída do servidor é descartada: a resposta do Mercado Pago também vai para
// logs/mercadopago.log na pasta de dados (só o que o Mercado Pago devolveu; o token nunca entra aqui).
const LOG = path.join(process.env.JUKEBOX_DATA_DIR || process.cwd(), 'logs', 'mercadopago.log');

// Causas mais comuns, em português para o dono resolver sozinho (códigos da API de pagamentos do Mercado Pago).
const MOTIVOS = {
  13253: 'a conta do Mercado Pago não tem chave Pix cadastrada (app Mercado Pago → Pix → Minhas chaves)',
  4050: 'o e-mail do pagador foi recusado pelo Mercado Pago',
  7: 'o Access Token não está liberado para receber pagamentos reais (ative as credenciais de produção)',
  401: 'o Access Token é inválido ou foi renovado: cole o token novo nas Configurações',
};

export function motivoDaRecusa(status, dados) {
  const causas = Array.isArray(dados?.cause) ? dados.cause : [];
  for (const causa of causas) if (MOTIVOS[causa?.code]) return MOTIVOS[causa.code];
  if (status === 401) return MOTIVOS[401];
  const texto = causas.find((c) => c?.description)?.description || dados?.message;
  return texto ? String(texto).replace(/\s+/g, ' ').slice(0, 160) : null;
}

function registrar(rota, status, dados) {
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true, mode: 0o700 });
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 256 * 1024) fs.renameSync(LOG, `${LOG}.old`);
    const linha = { quando: new Date().toISOString(), rota: rota.split('?')[0], status, resposta: dados };
    fs.appendFileSync(LOG, `${JSON.stringify(linha)}\n`, { mode: 0o600 });
  } catch { /* o log é ajuda; nunca derruba a cobrança */ }
}

export async function chamar(rota, { metodo = 'GET', corpo, idempotencia } = {}) {
  if (!cfg.token) throw new ErroApi(500, 'MERCADOPAGO_ACCESS_TOKEN não configurado');

  let resposta;
  try {
    resposta = await fetch(`${API}${rota}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
        ...(idempotencia && { 'X-Idempotency-Key': idempotencia }),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Sem internet a jukebox segue tocando; só não dá pra gerar Pix novo.
    throw new ErroApi(503, 'Sem conexão com o provedor de pagamento. Tente novamente em instantes.');
  }

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    console.error('[mercadopago]', resposta.status, JSON.stringify(dados));
    registrar(rota, resposta.status, dados);
    const motivo = motivoDaRecusa(resposta.status, dados);
    throw new ErroApi(502, `O provedor de pagamento recusou a cobrança${motivo ? `: ${motivo}` : ''}.`);
  }
  return dados;
}

// O Mercado Pago exige data com offset; o Brasil não tem horário de verão desde 2019.
const comOffsetBrasilia = (data) =>
  new Date(data.getTime() - 3 * 3600_000).toISOString().replace('Z', '-03:00');

function verificarAssinatura(req, pagamentoId) {
  if (!cfg.webhookSecret) return;

  const cabecalho = req.get('x-signature') || '';
  const partes = Object.fromEntries(cabecalho.split(',').map((p) => p.trim().split('=')));
  const manifesto = `id:${String(pagamentoId).toLowerCase()};request-id:${req.get('x-request-id') || ''};ts:${partes.ts};`;
  const esperado = crypto.createHmac('sha256', cfg.webhookSecret).update(manifesto).digest('hex');

  const recebido = Buffer.from(partes.v1 || '');
  const calculado = Buffer.from(esperado);
  if (recebido.length !== calculado.length || !crypto.timingSafeEqual(recebido, calculado)) {
    throw new ErroApi(401, 'Assinatura do webhook inválida');
  }
}

export const mercadopago = {
  nome: 'mercadopago',

  async criarCobranca({ valor, referencia, descricao, expiraEm }) {
    const pagamento = await chamar('/v1/payments', {
      metodo: 'POST',
      idempotencia: referencia,
      corpo: {
        transaction_amount: valor,
        description: descricao,
        payment_method_id: 'pix',
        payer: { email: 'cliente@jukebox.local' },
        external_reference: referencia,
        date_of_expiration: comOffsetBrasilia(expiraEm),
        ...(cfg.urlWebhook && { notification_url: `${cfg.urlWebhook.replace(/\/$/, '')}/api/pagamento/webhook` }),
      },
    });

    const qr = pagamento.point_of_interaction?.transaction_data?.qr_code;
    if (!pagamento.id || !qr) throw new ErroApi(502, 'O provedor de pagamento não devolveu o QR code do Pix.');
    return { pix_id: String(pagamento.id), qr_code: qr };
  },

  // O status vem sempre da API do provedor, nunca do corpo do webhook (que qualquer um pode forjar).
  async consultar(pixId) {
    const { status } = await chamar(`/v1/payments/${encodeURIComponent(pixId)}`);
    if (status === 'approved') return 'confirmado';
    if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(status)) return 'falho';
    return 'pendente';
  },

  // Cancela de verdade no provedor: um QR cancelado no app não pode ser pago depois (e ficar sem crédito).
  async cancelar(pixId) {
    await chamar(`/v1/payments/${encodeURIComponent(pixId)}`, { metodo: 'PUT', corpo: { status: 'cancelled' } });
  },

  extrairPixId(req) {
    const tipo = req.query.type ?? req.body?.type;
    const id = req.query['data.id'] ?? req.body?.data?.id;
    if (tipo !== 'payment' || !id) return null;
    verificarAssinatura(req, id);
    return String(id);
  },
};
