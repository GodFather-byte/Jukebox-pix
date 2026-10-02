import QRCode from 'qrcode';
import { db, agora, novoId } from '../database.js';
import { config } from '../config.js';
import { ErroApi } from '../erros.js';
import { emitirSessao } from '../events.js';
import * as configuracoes from './configuracoes.js';
import { obterGateway } from './gateways/index.js';
import { creditar, criarSessao, obterSessao } from './sessoes.js';

const MAX_PENDENTES_POR_SESSAO = 3;
const TOLERANCIA_EXPIRACAO_MS = 2 * 60_000; // Pix pago no último segundo ainda pode confirmar

const paraCliente = (p) => ({
  id: p.id,
  session_id: p.session_id,
  valor: p.valor,
  creditos: p.creditos,
  bonus: p.bonus,
  status: p.status,
  qr_code: p.qr_code,
  qr_imagem: p.qr_imagem,
  expira_em: p.expira_em,
  expirado: p.status === 'pendente' && p.expira_em < agora(),
});

export async function iniciar({ valor, sessionId }) {
  if (!configuracoes.lerRegras().vendas_abertas) {
    throw new ErroApi(403, 'As vendas de créditos estão encerradas por enquanto.', 'VENDAS_FECHADAS');
  }
  if (!Number.isInteger(valor) || valor < config.valorMin || valor > config.valorMax) {
    throw new ErroApi(400, `Informe um valor inteiro entre R$ ${config.valorMin} e R$ ${config.valorMax}.`);
  }

  let sessao = sessionId ? obterSessao(sessionId) : null;
  if (sessionId && !sessao) throw new ErroApi(404, 'Sessão não encontrada');
  sessao ??= criarSessao();

  const { pendentes } = db.prepare(
    "SELECT COUNT(*) AS pendentes FROM pagamentos WHERE session_id = ? AND status = 'pendente' AND expira_em > ?",
  ).get(sessao.id, agora());
  if (pendentes >= MAX_PENDENTES_POR_SESSAO) {
    throw new ErroApi(429, 'Você já tem Pix aguardando pagamento. Conclua ou aguarde expirar.');
  }

  // O bônus vale o que estava na tela quando o Pix foi gerado, mesmo que o dono mude as faixas depois.
  const bonus = configuracoes.bonusPara(valor);

  const gateway = obterGateway();
  const id = novoId();
  const expiraEm = new Date(Date.now() + config.pagamento.pixExpiraMin * 60_000);

  const cobranca = await gateway.criarCobranca({
    valor,
    referencia: id,
    descricao: `Créditos ${config.nomeLocal}`,
    expiraEm,
  });
  const qrImagem = await QRCode.toDataURL(cobranca.qr_code, { margin: 2, width: 360, errorCorrectionLevel: 'M' });

  db.prepare(`
    INSERT INTO pagamentos (id, session_id, valor, creditos, bonus, pix_id, provedor, qr_code, qr_imagem, status, criado_em, expira_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?)
  `).run(id, sessao.id, valor, valor, bonus, cobranca.pix_id, gateway.nome, cobranca.qr_code, qrImagem, agora(), expiraEm.toISOString());

  return paraCliente(obterRegistro(id));
}

const obterRegistro = (id) => db.prepare('SELECT * FROM pagamentos WHERE id = ?').get(id);

export function obter(id) {
  const pagamento = obterRegistro(id);
  return pagamento ? paraCliente(pagamento) : null;
}

// Só cancela Pix ainda pendente. Se o provedor recusar (ex.: acabou de ser pago), nada muda aqui:
// a próxima consulta confirma o pagamento normalmente.
export async function cancelar(id) {
  const pagamento = obterRegistro(id);
  if (!pagamento) throw new ErroApi(404, 'Pagamento não encontrado');
  if (pagamento.status !== 'pendente') return paraCliente(pagamento);

  const gateway = obterGateway();
  if (pagamento.provedor === gateway.nome) {
    try {
      await gateway.cancelar(pagamento.pix_id);
    } catch (erro) {
      if (erro.status === 503) throw erro;
      throw new ErroApi(409, 'Não foi possível cancelar agora. Se você já pagou, o crédito entra em instantes.');
    }
  }
  marcarFalho(pagamento);
  return paraCliente(obterRegistro(id));
}

const confirmarNoBanco = db.transaction((id) => {
  const pagamento = obterRegistro(id);
  if (!pagamento || pagamento.status === 'confirmado') return null; // idempotente: webhook repetido não credita de novo
  db.prepare("UPDATE pagamentos SET status = 'confirmado', confirmado_em = ? WHERE id = ?").run(agora(), id);
  // O bônus entra no saldo de cortesia: é custo da casa e não entra no faturamento dividido com a boate.
  creditar(pagamento.session_id, pagamento.creditos, pagamento.bonus);
  return pagamento;
});

// Também confirma Pix marcado como expirado: se o dinheiro entrou, o crédito é devido.
export function confirmar(id) {
  const pagamento = confirmarNoBanco(id);
  if (!pagamento) return false;

  console.log(`[pagamento] confirmado R$ ${pagamento.valor} (${pagamento.id})`);
  emitirSessao(pagamento.session_id, 'sessao', obterSessao(pagamento.session_id));
  emitirSessao(pagamento.session_id, 'pagamento', { id: pagamento.id, status: 'confirmado' });
  return true;
}

function marcarFalho(pagamento) {
  db.prepare("UPDATE pagamentos SET status = 'falho' WHERE id = ? AND status = 'pendente'").run(pagamento.id);
  emitirSessao(pagamento.session_id, 'pagamento', { id: pagamento.id, status: 'falho' });
}

async function sincronizar(pagamento) {
  const gateway = obterGateway();
  const status = pagamento.provedor === gateway.nome && gateway.nome !== 'mock'
    ? await gateway.consultar(pagamento.pix_id)
    : 'pendente';

  if (status === 'confirmado') return confirmar(pagamento.id);
  if (status === 'falho') return marcarFalho(pagamento);
  if (pagamento.status === 'pendente' && Date.now() > Date.parse(pagamento.expira_em) + TOLERANCIA_EXPIRACAO_MS) {
    marcarFalho(pagamento);
  }
}

export async function sincronizarPorPixId(pixId) {
  const pagamento = db.prepare('SELECT * FROM pagamentos WHERE pix_id = ?').get(pixId);
  if (pagamento) await sincronizar(pagamento);
}

// Fallback do webhook: o notebook na boate normalmente não é alcançável pela internet,
// então perguntamos ao provedor pelos Pix em aberto.
export async function verificarPendentes() {
  const pendentes = db.prepare("SELECT * FROM pagamentos WHERE status = 'pendente'").all();
  for (const pagamento of pendentes) {
    try {
      await sincronizar(pagamento);
    } catch (erro) {
      if (erro.status !== 503) console.error(`[pagamento] erro ao consultar ${pagamento.id}: ${erro.message}`);
    }
  }
}
