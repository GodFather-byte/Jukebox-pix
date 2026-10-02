import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config, validarConfig } from './config.js';
import { db } from './database.js';
import { ErroApi } from './erros.js';
import * as player from './player.js';
import { iniciarCronLancamentos } from './crons/lancamentos.js';
import { iniciarBackups } from './crons/backup.js';
import { iniciarManutencao } from './crons/manutencao.js';
import { iniciarVigia } from './crons/vigia.js';
import { urlDoApp } from './rede.js';
import { capasDir } from './services/biblioteca.js';
import { cartazesDir } from './services/cartazes.js';
import { iniciarRecados } from './services/recados.js';
import { iniciarSobDemanda } from './services/sobdemanda.js';
import { agendarAnalise } from './services/volume.js';
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

const backendPlayer = player.iniciar();
iniciarCronLancamentos();
iniciarManutencao();
iniciarBackups();
iniciarRecados();
iniciarSobDemanda(); // devolve o que ficou "preparando" numa queda e confere o yt-dlp (se o recurso estiver ligado)
iniciarVigia();
agendarAnalise(); // volume parelho ligado: mede em segundo plano o que ainda não foi medido

const servidor = app.listen(config.porta, config.host, () => {
  console.log(`\n🎵 ${config.nomeLocal} no ar`);
  console.log(`   Clientes (celular):  ${urlDoApp()}`);
  console.log(`   Monitor:             http://localhost:${config.porta}/tela`);
  console.log(`   Admin:               http://localhost:${config.porta}/admin`);
  console.log(`   Pagamento: ${config.pagamento.provedor}${config.pagamento.provedor === 'mock' ? ' (MODO DE TESTE, créditos grátis)' : ''} | Player: ${backendPlayer}\n`);
});

function encerrar() {
  player.parar();
  youtube.encerrarTudo();
  servidor.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
