// Server-Sent Events: cada celular/monitor mantém uma conexão aberta.
// Eventos "globais" só avisam que algo mudou (o cliente refaz o GET); dados da sessão
// (saldo) vão apenas pra conexão dona daquele session_id, que funciona como senha.
const clientes = new Set();

export function conectar(req, res, sessionId = null) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');

  const cliente = { res, sessionId };
  clientes.add(cliente);
  req.on('close', () => clientes.delete(cliente));
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
setInterval(() => {
  for (const cliente of clientes) cliente.res.write(': ping\n\n');
}, 25_000).unref();
