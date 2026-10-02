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
import { urlDoApp } from './rede.js';
import { capasDir } from './services/biblioteca.js';
import adminRoutes from './routes/admin.js';
import artistasRoutes from './routes/artistas.js';
import categoriasRoutes from './routes/categorias.js';
import cdsRoutes from './routes/cds.js';
import filaRoutes from './routes/fila.js';
import infoRoutes from './routes/info.js';
import musicasRoutes from './routes/musicas.js';
import pagamentoRoutes from './routes/pagamento.js';
import sessoesRoutes from './routes/sessoes.js';
import sugestoesRoutes from './routes/sugestoes.js';

validarConfig();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.use('/api/categorias', categoriasRoutes);
app.use('/api/artistas', artistasRoutes);
app.use('/api/cds', cdsRoutes);
app.use('/api/musicas', musicasRoutes);
app.use('/api/sessoes', sessoesRoutes);
app.use('/api/fila', filaRoutes);
app.use('/api/pagamento', pagamentoRoutes);
app.use('/api/sugestoes', sugestoesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', infoRoutes);
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));

// Só as capas são públicas; os arquivos de áudio nunca saem do notebook.
app.use('/capas', express.static(capasDir, { maxAge: '1d' }));

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
  if (erro?.name === 'MulterError') return res.status(400).json({ erro: `Upload inválido: ${erro.message}` });
  if (erro?.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido' });
  console.error(erro);
  res.status(500).json({ erro: 'Erro interno do servidor' });
});

const backendPlayer = player.iniciar();
iniciarCronLancamentos();
iniciarManutencao();
iniciarBackups();

const servidor = app.listen(config.porta, '0.0.0.0', () => {
  console.log(`\n🎵 ${config.nomeLocal} no ar`);
  console.log(`   Clientes (celular):  ${urlDoApp()}`);
  console.log(`   Monitor:             http://localhost:${config.porta}/tela`);
  console.log(`   Admin:               http://localhost:${config.porta}/admin`);
  console.log(`   Pagamento: ${config.pagamento.provedor}${config.pagamento.provedor === 'mock' ? ' (MODO DE TESTE, créditos grátis)' : ''} | Player: ${backendPlayer}\n`);
});

function encerrar() {
  player.parar();
  servidor.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
