import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config, validarConfig } from './config.js';
import { db } from './database.js';
import { encerrarEventos } from './events.js';
import { ErroApi } from './erros.js';
import * as player from './player.js';
import { iniciarCronLancamentos } from './crons/lancamentos.js';
import { iniciarBackups } from './crons/backup.js';
import { iniciarManutencao } from './crons/manutencao.js';
import { iniciarVigia } from './crons/vigia.js';
import { urlDoApp } from './rede.js';
import { capasDir } from './services/biblioteca.js';
import { cartazesDir } from './services/cartazes.js';
import { encerrarNoteiro, iniciarNoteiro } from './services/noteiro.js';
import { iniciarRecados } from './services/recados.js';
import { iniciarSobDemanda } from './services/sobdemanda.js';
import { agendarAnalise, encerrarTudo as encerrarVolume } from './services/volume.js';
import * as youtube from './services/youtube.js';
import adminRoutes from './routes/admin.js';
import artistasRoutes from './routes/artistas.js';
import cartazesRoutes from './routes/cartazes.js';
import categoriasRoutes from './routes/categorias.js';
import cdsRoutes from './routes/cds.js';
import filaRoutes from './routes/fila.js';
import infoRoutes from './routes/info.js';
import musicasRoutes from './routes/musicas.js';
import pagamentoRoutes from './routes/pagamento.js';
import quiosqueRoutes from './routes/quiosque.js';
import recadosRoutes from './routes/recados.js';
import sessoesRoutes from './routes/sessoes.js';
import sugestoesRoutes from './routes/sugestoes.js';
import valesRoutes from './routes/vales.js';
import youtubeRoutes from './routes/youtube.js';

validarConfig();

const app = express();
app.disable('x-powered-by');
if (config.confiarProxy) app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin',
  });
  next();
});
// O cliente escolhe e paga só no jukebox: de fora deste computador entra apenas o aviso do Mercado Pago
// (que de todo jeito só diz "consulte o pagamento X"). ACESSO_REDE=1 libera a rede de novo.
// Túnel ou proxy (cloudflared, Nginx) conectam pelo 127.0.0.1, mas trazem o cabeçalho de encaminhamento: não contam como local.
const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const ENCAMINHADO = ['x-forwarded-for', 'forwarded', 'cf-connecting-ip', 'x-real-ip'];
const ehLocal = (req) => LOCAL.has(req.socket.remoteAddress) && !ENCAMINHADO.some((h) => req.headers[h]);
app.use((req, res, next) => {
  if (config.acessoRede || ehLocal(req) || req.path === '/api/pagamento/webhook' || req.path === '/healthz') return next();
  res.status(403).type('text/plain; charset=utf-8').send('Este jukebox atende só na tela dele.');
});
// Verificação de saúde para hospedagens (Render, Railway, Docker, uptime monitors).
app.get('/healthz', (req, res) => {
  db.prepare('SELECT 1').get();
  res.json({ ok: true });
});
app.use(express.json({ limit: '100kb' }));

app.use('/api/categorias', categoriasRoutes);
app.use('/api/artistas', artistasRoutes);
app.use('/api/cds', cdsRoutes);
app.use('/api/musicas', musicasRoutes);
app.use('/api/sessoes', sessoesRoutes);
app.use('/api/fila', filaRoutes);
app.use('/api/pagamento', pagamentoRoutes);
app.use('/api/quiosque', quiosqueRoutes);
app.use('/api/sugestoes', sugestoesRoutes);
app.use('/api/recados', recadosRoutes);
app.use('/api/vales', valesRoutes);
app.use('/api/cartazes', cartazesRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', infoRoutes);
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));

// Só as capas e os cartazes do monitor são públicos; os arquivos de áudio nunca saem do notebook.
app.use('/capas', express.static(capasDir, { maxAge: '1d' }));
app.use('/cartazes', express.static(cartazesDir, { maxAge: '1d' }));

const indexHtml = path.join(config.frontendDist, 'index.html');
if (fs.existsSync(indexHtml)) {
  app.use(express.static(config.frontendDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(indexHtml);
  });
} else {
  console.warn('[server] frontend/dist não encontrado: rode "npm run build" (ou "npm --prefix frontend run dev" em desenvolvimento).');
}

app.use((erro, req, res, next) => {
  if (erro instanceof ErroApi) return res.status(erro.status).json({ erro: erro.message, codigo: erro.codigo });
  if (erro?.name === 'MulterError') {
    const motivos = { LIMIT_FILE_SIZE: 'o arquivo é grande demais', LIMIT_FILE_COUNT: 'arquivos demais', LIMIT_UNEXPECTED_FILE: 'arquivo inesperado' };
    return res.status(400).json({ erro: `Upload inválido: ${motivos[erro.code] ?? erro.message}` });
  }
  if (erro?.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido' });
  console.error(erro);
  res.status(500).json({ erro: 'Erro interno do servidor' });
});

let encerrando = false;
const conexoes = new Set();
const notificar = (mensagem) => process.parentPort?.postMessage(mensagem);

export const servidor = app.listen(config.porta, config.host, (erro) => {
  if (erro || encerrando) return;
  let backendPlayer;
  try {
    db.prepare('SELECT 1').get();
    config.porta = servidor.address().port;
    backendPlayer = player.iniciar();
    iniciarCronLancamentos();
    iniciarManutencao();
    iniciarBackups();
    iniciarRecados();
    iniciarNoteiro();
    iniciarSobDemanda();
    iniciarVigia();
    agendarAnalise();
  } catch (erro) {
    if (!process.parentPort) console.error(erro);
    notificar({ type: 'startup-error', code: 'STARTUP_FAILED' });
    encerrar(1);
    return;
  }
  notificar({ type: 'ready', port: servidor.address().port, clientUrl: urlDoApp(), player: backendPlayer });
  console.log(`\n🎵 ${config.nomeLocal} no ar`);
  console.log(`   Jukebox:             http://localhost:${config.porta}/`);
  console.log(`   Telão (2º monitor):  http://localhost:${config.porta}/telao`);
  console.log(`   Admin:               http://localhost:${config.porta}/admin`);
  console.log(`   Pagamento: ${config.pagamento.provedor}${config.pagamento.provedor === 'mock' ? ' (MODO DE TESTE, créditos grátis)' : ''} | Player: ${backendPlayer}\n`);
});
servidor.on('connection', (socket) => {
  conexoes.add(socket);
  socket.once('close', () => conexoes.delete(socket));
  if (encerrando) socket.destroy();
});
servidor.on('error', (erro) => {
  if (!process.parentPort) console.error(erro);
  notificar({ type: 'startup-error', code: erro.code === 'EADDRINUSE' ? 'EADDRINUSE' : 'STARTUP_FAILED' });
  encerrar(1);
});

export function encerrar(codigo = 0) {
  if (encerrando) return;
  encerrando = true;
  clearTimeout(watchdog);
  let finalizado = false;
  const finalizar = () => {
    if (finalizado) return;
    finalizado = true;
    clearTimeout(limite);
    for (const socket of conexoes) socket.destroy();
    try {
      db.close();
    } finally {
      notificar({ type: 'stopped' });
      process.exit(codigo);
    }
  };
  const limite = setTimeout(finalizar, 3000);
  player.parar();
  encerrarNoteiro();
  youtube.encerrarTudo();
  encerrarVolume();
  encerrarEventos();
  servidor.close(finalizar);
  servidor.closeIdleConnections?.();
}
process.on('SIGINT', () => encerrar());
process.on('SIGTERM', () => encerrar());
const watchdog = process.parentPort ? setTimeout(() => encerrar(), 10_000).unref() : null;
process.parentPort?.on('message', (evento) => {
  if (evento.data?.type === 'shutdown') encerrar();
  if (evento.data?.type === 'heartbeat' && !encerrando) watchdog.refresh();
});
