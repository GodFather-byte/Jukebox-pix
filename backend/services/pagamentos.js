import QRCode from 'qrcode';
import { db, agora, novoId } from '../database.js';
import { config } from '../config.js';
import { ErroApi } from '../erros.js';
import { emitirSessao } from '../events.js';
import * as configuracoes from './configuracoes.js';
import { gatewayPorNome, obterGateway, obterGatewayCartao } from './gateways/index.js';
import { creditar, criarSessao, obterSessao } from './sessoes.js';

const MAX_PENDENTES_POR_SESSAO = 3;
const TOLERANCIA_EXPIRACAO_MS = 2 * 60_000; // Pix pago no último segundo ainda pode confirmar
const DESISTENCIA_MAQUININHA_MS = 30 * 60_000; // maquininha sem resposta ao cancelar: desiste de esperar
export const METODOS = ['pix', 'cartao', 'nota'];

const paraCliente = (p) => ({
  id: p.id,
  session_id: p.session_id,
  valor: p.valor,
  creditos: p.creditos,
  bonus: p.bonus,
  metodo: p.metodo,
  status: p.status,
  qr_code: p.qr_code,
  qr_imagem: p.qr_imagem,
  expira_em: p.expira_em,
  expirado: p.status === 'pendente' && p.expira_em < agora(),
});

// Pix (QR na tela) ou cartão (maquininha). Notas entram direto por registrarNota.
export async function iniciar({ valor, sessionId, metodo = 'pix', tipoCartao = 'credito' }) {
  if (!['pix', 'cartao'].includes(metodo)) throw new ErroApi(400, 'Forma de pagamento inválida.');
  if (!['credito', 'debito'].includes(tipoCartao)) throw new ErroApi(400, 'Escolha débito ou crédito.');
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
    throw new ErroApi(429, 'Já há pagamentos aguardando. Conclua ou aguarde expirar.');
  }
  // A maquininha atende uma cobrança por vez: a anterior que ficou na tela dela sai antes.
  if (metodo === 'cartao') {
    const anteriores = db.prepare("SELECT id FROM pagamentos WHERE metodo = 'cartao' AND status = 'pendente'").all();
    for (const { id: anterior } of anteriores) {
      const resultado = await cancelar(anterior).catch(() => null);
      if (resultado?.status === 'pendente' || !resultado) {
        throw new ErroApi(409, 'A maquininha ainda está com um pagamento em andamento. Termine ou cancele nela.', 'MAQUININHA_OCUPADA');
      }
    }
  }

  // O bônus vale o que estava na tela quando o Pix foi gerado, mesmo que o dono mude as faixas depois.
  const bonus = configuracoes.bonusPara(valor);

  const gateway = metodo === 'cartao' ? obterGatewayCartao() : obterGateway();
  const id = novoId();
  const minutos = metodo === 'cartao' ? config.pagamento.cartaoExpiraMin : config.pagamento.pixExpiraMin;
  const expiraEm = new Date(Date.now() + minutos * 60_000);

  const cobranca = await gateway.criarCobranca({
    valor,
    referencia: id,
    descricao: `Créditos ${config.nomeLocal}`,
    expiraEm,
    tipoCartao,
  });
  const qrCode = metodo === 'pix' ? cobranca.qr_code : null;
  const qrImagem = qrCode ? await QRCode.toDataURL(qrCode, { margin: 2, width: 360, errorCorrectionLevel: 'M' }) : null;

  db.prepare(`
    INSERT INTO pagamentos (id, session_id, valor, creditos, bonus, pix_id, provedor, qr_code, qr_imagem, metodo, status, criado_em, expira_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?)
  `).run(id, sessao.id, valor, valor, bonus, cobranca.pix_id, gateway.nome, qrCode, qrImagem, metodo, agora(), expiraEm.toISOString());

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

  const gateway = gatewayPorNome(pagamento.provedor);
  if (gateway) {
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

  console.log(`[pagamento] confirmado R$ ${pagamento.valor} via ${pagamento.metodo} (${pagamento.id})`);
  emitirSessao(pagamento.session_id, 'sessao', obterSessao(pagamento.session_id));
  emitirSessao(pagamento.session_id, 'pagamento', {
    id: pagamento.id, status: 'confirmado', metodo: pagamento.metodo, valor: pagamento.valor, creditos: pagamento.creditos + pagamento.bonus,
  });
  return true;
}

function marcarFalho(pagamento) {
  db.prepare("UPDATE pagamentos SET status = 'falho' WHERE id = ? AND status = 'pendente'").run(pagamento.id);
  emitirSessao(pagamento.session_id, 'pagamento', { id: pagamento.id, status: 'falho' });
}

async function sincronizar(pagamento) {
  const gateway = gatewayPorNome(pagamento.provedor);
  const status = gateway && gateway.nome !== 'mock' ? await gateway.consultar(pagamento.pix_id) : 'pendente';

  if (status === 'confirmado') return confirmar(pagamento.id);
  if (status === 'falho') return marcarFalho(pagamento);
  if (pagamento.status !== 'pendente') return;
  const passou = Date.now() - Date.parse(pagamento.expira_em);
  if (pagamento.metodo === 'cartao' && passou > 0) {
    // O tempo acabou: tira a cobrança da maquininha para ninguém pagar sem receber o crédito.
    // Se ela não deixar cancelar (o cliente acabou de pagar), a próxima consulta confirma.
    try {
      await gateway?.cancelar(pagamento.pix_id);
      return marcarFalho(pagamento);
    } catch {
      if (passou > DESISTENCIA_MAQUININHA_MS) marcarFalho(pagamento);
      return;
    }
  }
  if (passou > TOLERANCIA_EXPIRACAO_MS) marcarFalho(pagamento);
}

// Nota que o noteiro aceitou: o dinheiro já está na máquina, então entra confirmado, com o bônus da hora.
export function registrarNota(sessionId, valor) {
  if (!Number.isInteger(valor) || valor < 1 || valor > 500) throw new ErroApi(400, 'Valor de nota inválido.');
  const id = novoId();
  const bonus = configuracoes.bonusPara(valor);
  const momento = agora();
  db.prepare(`
    INSERT INTO pagamentos (id, session_id, valor, creditos, bonus, provedor, metodo, status, criado_em, expira_em)
    VALUES (?, ?, ?, ?, ?, 'noteiro', 'nota', 'pendente', ?, ?)
  `).run(id, sessionId, valor, valor, bonus, momento, momento);
  confirmar(id);
  return paraCliente(obterRegistro(id));
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
