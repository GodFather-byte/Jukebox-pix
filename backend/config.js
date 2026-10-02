import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;

const num = (nome, padrao) => {
  const valor = env[nome];
  if (valor === undefined || valor === '') return padrao;
  const n = Number(valor);
  return Number.isFinite(n) ? n : padrao;
};
const caminho = (nome, padrao) => path.resolve(raiz, env[nome] || padrao);
const musicasDir = caminho('MUSICAS_DIR', 'musicas');

export const config = {
  producao: env.NODE_ENV === 'production',
  porta: num('PORT', 3000),
  urlPublica: env.PUBLIC_URL || null,
  nomeLocal: env.NOME_LOCAL || 'Jukebox',

  raiz,
  dbPath: caminho('DB_PATH', 'database/jukebox.db'),
  musicasDir,
  // Pasta onde você solta Artista/CD/faixas para importar vários CDs de uma vez.
  importDir: env.IMPORT_DIR ? path.resolve(raiz, env.IMPORT_DIR) : path.join(musicasDir, '_importar'),
  frontendDist: path.join(raiz, 'frontend', 'dist'),
  backupDir: caminho('BACKUP_DIR', 'backups'),
  backupManter: num('BACKUP_MANTER', 14), // quantos backups diários guardar

  // 1 crédito = R$ 1,00
  valoresPix: [5, 10, 20, 50],
  valorMin: num('VALOR_MIN', 1),
  valorMax: num('VALOR_MAX', 500),

  sessaoTtlMin: num('SESSAO_TTL_MIN', 60),
  lancamentoDias: num('LANCAMENTO_DIAS', 7),
  filaMax: num('FILA_MAX', 60),
  divisaoUsuario: num('DIVISAO_USUARIO', 50), // % do usuário; o resto vai pra boate
  creditosDonoMax: num('CREDITOS_DONO_MAX', 50), // teto do crédito de cortesia (1 vez por dia)

  pagamento: {
    provedor: env.PAYMENT_PROVIDER || 'mock',
    pixExpiraMin: num('PIX_EXPIRA_MIN', 15),
    mercadopago: {
      token: env.MERCADOPAGO_ACCESS_TOKEN || '',
      webhookSecret: env.MERCADOPAGO_WEBHOOK_SECRET || '',
      urlWebhook: env.WEBHOOK_PUBLIC_URL || '',
    },
  },

  admin: {
    senha: env.ADMIN_PASSWORD || 'admin',
    segredo: env.ADMIN_SECRET || crypto.randomBytes(32).toString('hex'),
  },

  player: {
    tipo: env.PLAYER || 'auto', // auto | mpv | vlc | sim
    mpv: env.MPV_PATH || 'mpv',
    vlc: env.VLC_PATH || '',
    simSegundos: num('PLAYER_SIM_SEGUNDOS', 15),
  },
};

// Falha cedo em produção: modo de teste ou senha padrão liberariam créditos/admin pra qualquer um no WiFi.
export function validarConfig() {
  if (!config.producao) return;
  const problemas = [];
  if (config.pagamento.provedor === 'mock') problemas.push('PAYMENT_PROVIDER=mock libera créditos grátis; use um provedor real');
  if (config.admin.senha === 'admin') problemas.push('ADMIN_PASSWORD ainda é a senha padrão');
  if (problemas.length) throw new Error(`Configuração insegura para produção:\n - ${problemas.join('\n - ')}`);
}
