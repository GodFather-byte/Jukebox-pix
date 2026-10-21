const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');

function createSettings(directory, mode) {
  if (!['teste', 'producao'].includes(mode)) throw new Error('Modo inválido.');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const password = crypto.randomBytes(18).toString('base64url');
  const text = [
    '# Configuração local do Jukebox Pix. Feche o aplicativo antes de editar.',
    '# Não compartilhe este arquivo: ele contém sua senha e suas credenciais.',
    `DESKTOP_MODE=${mode}`,
    `ADMIN_PASSWORD=${password}`,
    `ADMIN_SECRET=${crypto.randomBytes(32).toString('hex')}`,
    'PORT=3000',
    `HOST=${mode === 'teste' ? '127.0.0.1' : '0.0.0.0'}`,
    `PAYMENT_PROVIDER=${mode === 'teste' ? 'mock' : 'mercadopago'}`,
    `PLAYER=${mode === 'teste' ? 'sim' : 'auto'}`,
    '# Produção: preencha com as credenciais da SUA conta Mercado Pago.',
    'MERCADOPAGO_ACCESS_TOKEN=',
    'MERCADOPAGO_WEBHOOK_SECRET=',
    'WEBHOOK_PUBLIC_URL=',
    '# Caminhos relativos ficam nesta pasta de dados; caminhos absolutos também são aceitos.',
    'DB_PATH=database/jukebox.db',
    'MUSICAS_DIR=musicas',
    'BACKUP_DIR=backups',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(directory, '.env'), text, { flag: 'wx', mode: 0o600 });
}

function readSettings(directory, inherited = process.env) {
  const values = dotenv.parse(fs.readFileSync(path.join(directory, '.env')));
  const test = values.DESKTOP_MODE === 'teste';
  if (!test && values.DESKTOP_MODE !== 'producao') {
    throw new Error('Defina DESKTOP_MODE=producao ou escolha explicitamente DESKTOP_MODE=teste no arquivo .env.');
  }
  if (!values.ADMIN_PASSWORD || values.ADMIN_PASSWORD.length < 12 || values.ADMIN_PASSWORD === 'admin') {
    throw new Error('Defina ADMIN_PASSWORD com pelo menos 12 caracteres no arquivo .env.');
  }
  if (!values.ADMIN_SECRET || values.ADMIN_SECRET.length < 32) {
    throw new Error('Defina ADMIN_SECRET com pelo menos 32 caracteres aleatórios no arquivo .env.');
  }
  const port = Number(values.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT deve estar entre 1 e 65535.');
  if (!test && (values.PAYMENT_PROVIDER !== 'mercadopago' || !values.MERCADOPAGO_ACCESS_TOKEN?.trim())) {
    throw new Error('Para produção, use PAYMENT_PROVIDER=mercadopago e preencha MERCADOPAGO_ACCESS_TOKEN no arquivo .env.');
  }
  // A configuração local é a autoridade: variáveis herdadas não podem mudar caminhos ou credenciais.
  const env = Object.fromEntries(Object.entries(inherited).filter(([key]) =>
    /^(PATH|Path|SYSTEMROOT|SystemRoot|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|TMPDIR|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|LANG|LC_ALL|DISPLAY|XAUTHORITY|XDG_RUNTIME_DIR|DBUS_SESSION_BUS_ADDRESS)$/i.test(key)));
  Object.assign(env, values, {
    JUKEBOX_DATA_DIR: directory,
    DOTENV_CONFIG_PATH: path.join(directory, '.env'),
    DOTENV_CONFIG_QUIET: 'true',
    NODE_ENV: test ? 'development' : 'production',
    PORT: String(port),
  });
  if (test) Object.assign(env, { HOST: '127.0.0.1', PAYMENT_PROVIDER: 'mock', PLAYER: values.PLAYER || 'sim', PUBLIC_URL: '' });
  return { env, port, test };
}

const externalHosts = new Set(['github.com', 'www.mercadopago.com.br', 'mpv.io', 'www.videolan.org']);
function externalURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && externalHosts.has(url.hostname);
  } catch {
    return false;
  }
}

function localURL(value, origin) {
  try {
    const url = new URL(value);
    return url.origin === origin && !url.username && !url.password;
  } catch {
    return false;
  }
}

module.exports = { createSettings, readSettings, externalURL, localURL };
