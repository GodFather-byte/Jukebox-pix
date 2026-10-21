// Server-Sent Events: cada celular/monitor mantém uma conexão aberta.
// Eventos "globais" só avisam que algo mudou (o cliente refaz o GET); dados da sessão
// (saldo) vão apenas pra conexão dona daquele session_id, que funciona como senha.
const clientes = new Set();
let encerrando = false;

// O monitor (/tela) se identifica na conexão. Recado pago só é aceito com um telão ligado,
// e os celulares precisam saber quando ele liga ou desliga.
let avisoDeTelaPendente = null;

export const telasConectadas = () => {
  let total = 0;
  for (const cliente of clientes) if (cliente.tela) total += 1;
  return total;
};

function avisarMudancaDeTelas() {
  if (encerrando) return;
  clearTimeout(avisoDeTelaPendente);
  avisoDeTelaPendente = setTimeout(() => emitirTodos('config'), 500); // junta o liga/desliga de várias abas
  avisoDeTelaPendente.unref?.();
}

export function conectar(req, res, sessionId = null, { tela = false } = {}) {
  if (encerrando) return res.status(503).end();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');

  const cliente = { res, sessionId, tela };
  clientes.add(cliente);
  if (tela) avisarMudancaDeTelas();
  req.on('close', () => {
    clientes.delete(cliente);
    if (tela) avisarMudancaDeTelas();
  });
}

function enviar(cliente, evento, dados) {
  cliente.res.write(`event: ${evento}\ndata: ${JSON.stringify(dados ?? {})}\n\n`);
}

export function emitirTodos(evento, dados) {
  for (const cliente of clientes) enviar(cliente, evento, dados);
}

export function emitirSessao(sessionId, evento, dados) {
  for (const cliente of clientes) {
    if (cliente.sessionId === sessionId) enviar(cliente, evento, dados);
  }
}

// Comentário periódico mantém a conexão viva atrás de proxies e detecta clientes mortos.
const ping = setInterval(() => {
  for (const cliente of clientes) cliente.res.write(': ping\n\n');
}, 25_000).unref();

export function encerrarEventos() {
  encerrando = true;
  clearInterval(ping);
  clearTimeout(avisoDeTelaPendente);
  for (const cliente of clientes) cliente.res.end();
  clientes.clear();
}
