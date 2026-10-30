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
    // O cliente escolhe e paga só na tela do jukebox: o servidor não precisa atender a rede.
    'HOST=127.0.0.1',
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

// Valor seguro para o .env: senha digitada pelo dono pode ter espaço, #, aspas. Aspas simples e crase são literais no dotenv.
function valorEnv(valor) {
  const texto = String(valor ?? '');
  if (/[\r\n]/.test(texto)) throw new Error('O valor não pode ter quebra de linha.');
  if (/^[\w@%+=:,./-]*$/.test(texto)) return texto;
  if (!texto.includes("'")) return `'${texto}'`;
  if (!texto.includes('`')) return `\`${texto}\``;
  if (!texto.includes('"') && !texto.includes('\\')) return `"${texto}"`;
  throw new Error('Use no máximo dois tipos de aspas (\', ", `) no mesmo valor.');
}

// Troca (ou acrescenta) só as chaves pedidas e mantém o resto do arquivo como o dono deixou.
function atualizarEnv(texto, valores) {
  const vistos = new Set();
  const linhas = [];
  for (const linha of texto.split(/\r?\n/)) {
    const chave = linha.match(/^\s*(?:export\s+)?([\w.-]+)\s*=/)?.[1];
    if (chave && Object.hasOwn(valores, chave)) {
      if (!vistos.has(chave)) linhas.push(`${chave}=${valorEnv(valores[chave])}`);
      vistos.add(chave); // repetidas mais abaixo valeriam por cima: saem
    } else linhas.push(linha);
  }
  while (linhas.length && linhas.at(-1) === '') linhas.pop();
  for (const [chave, valor] of Object.entries(valores)) if (!vistos.has(chave)) linhas.push(`${chave}=${valorEnv(valor)}`);
  return `${linhas.join('\n')}\n`;
}

// Sugestão para a tela: só letras e números fáceis de ler e de digitar no celular (sem 0/O, 1/l/I).
function senhaAleatoria(tamanho = 14) {
  const letras = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: tamanho }, () => letras[crypto.randomInt(letras.length)]).join('');
}

// O que a tela de configuração mostra. O token não sai daqui: a tela só sabe se ele existe.
function lerConfiguracao(directory) {
  const file = path.join(directory, '.env');
  if (!fs.existsSync(file)) {
    return { existe: false, modo: 'producao', nomeLocal: '', senha: senhaAleatoria(), porta: 3000, temToken: false, terminal: '', noteiroPorta: '', acervoExterno: '', iniciarComSistema: true };
  }
  const values = dotenv.parse(fs.readFileSync(file));
  return {
    existe: true,
    modo: values.DESKTOP_MODE === 'teste' ? 'teste' : 'producao',
    nomeLocal: values.NOME_LOCAL || '',
    senha: values.ADMIN_PASSWORD || '',
    porta: Number(values.PORT || 3000),
    temToken: Boolean(values.MERCADOPAGO_ACCESS_TOKEN?.trim()),
    terminal: values.MERCADOPAGO_POINT_TERMINAL || '',
    noteiroPorta: values.NOTEIRO === 'serial' ? values.NOTEIRO_PORTA || '' : '',
    acervoExterno: values.ACERVO_EXTERNO_DIR || '',
    iniciarComSistema: values.INICIAR_COM_SISTEMA === '1',
  };
}

// Grava o que o dono preencheu na tela de configuração. Token em branco mantém o que já estava.
// Se o resultado não passar na validação de readSettings, o arquivo anterior volta e o erro sobe para a tela.
function salvarConfiguracao(directory, campos) {
  const modo = campos.modo;
  if (!['teste', 'producao'].includes(modo)) throw new Error('Escolha produção ou teste.');
  const senha = String(campos.senha ?? '');
  if (senha.length < 12 || senha === 'admin') throw new Error('A senha do painel precisa ter pelo menos 12 caracteres.');
  const porta = Number(campos.porta);
  if (!Number.isInteger(porta) || porta < 1024 || porta > 65535) throw new Error('A porta deve ser um número entre 1024 e 65535.');
  const nomeLocal = String(campos.nomeLocal ?? '').trim();
  if (nomeLocal.length > 40) throw new Error('O nome do local pode ter no máximo 40 letras.');
  const token = String(campos.token ?? '').trim();
  const terminal = String(campos.terminal ?? '').trim();
  const noteiroPorta = String(campos.noteiroPorta ?? '').trim();
  if (/\s/.test(terminal) || terminal.length > 120) throw new Error('Maquininha inválida.');
  if (noteiroPorta.length > 120) throw new Error('Porta do noteiro inválida.');
  const acervoExterno = String(campos.acervoExterno ?? '').trim();
  if (acervoExterno && (!path.isAbsolute(acervoExterno) || /[\r\n]/.test(acervoExterno))) {
    throw new Error('Pasta de músicas da outra jukebox: informe o caminho completo (ex.: /media/jukebox/HD/home/jkb/musicas).');
  }

  const file = path.join(directory, '.env');
  const existia = fs.existsSync(file);
  if (!existia) createSettings(directory, modo);
  const anterior = fs.readFileSync(file, 'utf8');
  const atuais = dotenv.parse(anterior);
  if (modo === 'producao' && !token && !atuais.MERCADOPAGO_ACCESS_TOKEN?.trim()) {
    if (!existia) fs.rmSync(file);
    throw new Error('Para atender clientes, cole o Access Token da sua conta Mercado Pago.');
  }
  const valores = {
    DESKTOP_MODE: modo, ADMIN_PASSWORD: senha, PORT: String(porta), NOME_LOCAL: nomeLocal,
    MERCADOPAGO_POINT_TERMINAL: terminal,
    NOTEIRO: noteiroPorta ? 'serial' : 'desligado',
    NOTEIRO_PORTA: noteiroPorta,
    ACERVO_EXTERNO_DIR: acervoExterno,
    INICIAR_COM_SISTEMA: campos.iniciarComSistema ? '1' : '0',
  };
  if (token) valores.MERCADOPAGO_ACCESS_TOKEN = token;
  // Rede, provedor e player só mudam junto com o modo: ajuste manual do dono (PLAYER=vlc, HOST=IP) fica.
  if (atuais.DESKTOP_MODE !== modo || !existia) {
    Object.assign(valores, modo === 'teste'
      ? { HOST: '127.0.0.1', PAYMENT_PROVIDER: 'mock', PLAYER: 'sim' }
      : { HOST: '127.0.0.1', PAYMENT_PROVIDER: 'mercadopago', PLAYER: 'auto' });
  }
  if (!atuais.ADMIN_SECRET || atuais.ADMIN_SECRET.length < 32) valores.ADMIN_SECRET = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, atualizarEnv(anterior, valores), { mode: 0o600 });
  try {
    readSettings(directory, {});
  } catch (error) {
    if (existia) fs.writeFileSync(file, anterior, { mode: 0o600 });
    else fs.rmSync(file);
    throw error;
  }
}

function readSettings(directory, inherited = process.env, ferramentas = {}) {
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
  // Ferramentas do instalador entram por baixo: um caminho escrito no .env vale mais.
  Object.assign(env, ferramentas, values, {
    JUKEBOX_DATA_DIR: directory,
    DOTENV_CONFIG_PATH: path.join(directory, '.env'),
    DOTENV_CONFIG_QUIET: 'true',
    NODE_ENV: test ? 'development' : 'production',
    PORT: String(port),
  });
  for (const [chave, valor] of Object.entries(ferramentas)) if (!env[chave]) env[chave] = valor; // "MPV_PATH=" vazio
  if (test) Object.assign(env, { HOST: '127.0.0.1', PAYMENT_PROVIDER: 'mock', PLAYER: values.PLAYER || 'sim', PUBLIC_URL: '' });
  return { env, port, test, iniciarComSistema: values.INICIAR_COM_SISTEMA === '1' };
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

module.exports = { createSettings, readSettings, lerConfiguracao, salvarConfiguracao, atualizarEnv, externalURL, localURL };
