const { BrowserWindow, ipcMain, shell, clipboard } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const dotenv = require('dotenv');
const { lerConfiguracao, salvarConfiguracao, externalURL } = require('./settings.cjs');
const { situacaoFerramentas } = require('./ferramentas.cjs');

const CANAIS = ['config:ler', 'config:salvar', 'config:testar-token', 'config:maquininhas', 'config:ativar-pdv', 'config:portas', 'config:copiar', 'config:link', 'config:cancelar'];
const pagina = pathToFileURL(path.join(__dirname, 'configurar.html')).href;

// Confere o token na API do Mercado Pago, sem gravar nada. Token de teste ("TEST-") não cobra Pix de verdade.
async function testarToken(token) {
  if (!token) return { ok: false, mensagem: 'Cole o Access Token para testar.' };
  try {
    const resposta = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
    });
    if (resposta.status === 401 || resposta.status === 403) return { ok: false, mensagem: 'O Mercado Pago recusou este token. Confira se copiou o Access Token inteiro.' };
    if (!resposta.ok) return { ok: false, mensagem: `O Mercado Pago respondeu com erro (${resposta.status}). Tente de novo em instantes.` };
    const conta = await resposta.json();
    const nome = conta.nickname || conta.first_name || 'sua conta';
    if (token.startsWith('TEST-')) return { ok: true, alerta: true, mensagem: `Token de TESTE de ${nome}: o Pix não será cobrado de verdade. Para atender clientes use o token de produção (APP_USR-...).` };
    return { ok: true, mensagem: `Token válido: conta ${nome}.` };
  } catch {
    return { ok: false, mensagem: 'Sem resposta do Mercado Pago. Confira a internet deste computador.' };
  }
}

// Token digitado agora ou, em branco, o que já está no .env.
function tokenOuSalvo(token, dataDir) {
  if (token) return token;
  const arquivo = path.join(dataDir, '.env');
  return fs.existsSync(arquivo) ? dotenv.parse(fs.readFileSync(arquivo)).MERCADOPAGO_ACCESS_TOKEN?.trim() || '' : '';
}

async function chamarMercadoPago(token, rota, opcoes = {}) {
  const resposta = await fetch(`https://api.mercadopago.com${rota}`, {
    ...opcoes,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!resposta.ok) throw new Error(resposta.status === 401 ? 'O Mercado Pago recusou o token.' : `O Mercado Pago respondeu com erro (${resposta.status}).`);
  return resposta.json();
}

// Maquininhas Point ligadas à conta. Só as que estão em modo PDV recebem cobranças do jukebox.
async function listarMaquininhas(token) {
  if (!token) return { ok: false, mensagem: 'Cole o Access Token primeiro.' };
  try {
    const dados = await chamarMercadoPago(token, '/terminals/v1/list?limit=50');
    const terminais = (dados.data?.terminals ?? []).map((t) => ({ id: t.id, modo: t.operating_mode }));
    if (!terminais.length) return { ok: false, mensagem: 'Nenhuma maquininha Point nesta conta. Vincule a maquininha no app do Mercado Pago.' };
    return { ok: true, terminais };
  } catch (e) {
    return { ok: false, mensagem: e.message || 'Sem resposta do Mercado Pago.' };
  }
}

async function ativarPdv(token, id) {
  try {
    await chamarMercadoPago(token, '/terminals/v1/setup', { method: 'PATCH', body: JSON.stringify({ terminals: [{ id, operating_mode: 'PDV' }] }) });
    return { ok: true, mensagem: 'Modo PDV ativado. Reinicie a maquininha para valer.' };
  } catch (e) {
    return { ok: false, mensagem: e.message };
  }
}

// Portas seriais deste computador, para escolher onde está a placa do noteiro.
async function listarPortas() {
  try {
    const { SerialPort } = require('serialport');
    const portas = await SerialPort.list();
    return portas.map((p) => ({ caminho: p.path, nome: [p.manufacturer, p.friendlyName].filter(Boolean).join(' · ') }));
  } catch {
    return [];
  }
}

// Abre a tela e resolve com 'salvo' ou 'cancelado'. Só uma por vez.
let aberta = null;
function abrirConfiguracao({ dataDir, ferramentas, erro }) {
  if (aberta) {
    aberta.janela.focus();
    return aberta.promessa;
  }
  const janela = new BrowserWindow({
    width: 780, height: 860, minWidth: 420, title: 'Configurar o Jukebox Pix', autoHideMenuBar: true,
    backgroundColor: '#0f0b1a',
    webPreferences: {
      preload: path.join(__dirname, 'configurar-preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false,
    },
  });
  janela.removeMenu();
  janela.webContents.on('will-navigate', (event) => event.preventDefault());
  janela.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  janela.webContents.on('page-title-updated', (event) => event.preventDefault());

  let resultado = 'cancelado';
  const promessa = new Promise((resolve) => {
    const daPagina = (event) => event.senderFrame?.url === pagina && event.sender === janela.webContents;
    const tratar = (canal, funcao) => ipcMain.handle(canal, (event, ...args) => {
      if (!daPagina(event)) throw new Error('Origem não permitida.');
      return funcao(...args);
    });
    tratar('config:ler', () => {
      const atual = lerConfiguracao(dataDir);
      const arquivo = path.join(dataDir, '.env');
      const doEnv = fs.existsSync(arquivo) ? dotenv.parse(fs.readFileSync(arquivo)) : {};
      const caminhos = { ...ferramentas };
      for (const chave of ['MPV_PATH', 'VLC_PATH', 'FFMPEG_PATH', 'YTDLP_PATH']) if (doEnv[chave]) caminhos[chave] = doEnv[chave];
      return { ...atual, erro: erro || '', plataforma: process.platform === 'win32' ? 'win' : 'linux', situacao: situacaoFerramentas(caminhos) };
    });
    tratar('config:salvar', (campos) => {
      try {
        salvarConfiguracao(dataDir, campos || {});
        resultado = 'salvo';
        janela.close();
        return { ok: true };
      } catch (e) {
        return { ok: false, erro: e.message };
      }
    });
    tratar('config:testar-token', (token) => testarToken(String(token || '').trim()));
    tratar('config:maquininhas', (token) => listarMaquininhas(tokenOuSalvo(String(token || '').trim(), dataDir)));
    tratar('config:ativar-pdv', (token, id) => ativarPdv(tokenOuSalvo(String(token || '').trim(), dataDir), String(id || '')));
    tratar('config:portas', listarPortas);
    tratar('config:copiar', (texto) => clipboard.writeText(String(texto || '')));
    tratar('config:link', (url) => { if (externalURL(url)) shell.openExternal(url).catch(() => {}); });
    tratar('config:cancelar', () => janela.close());
    janela.on('closed', () => {
      for (const canal of CANAIS) ipcMain.removeHandler(canal);
      aberta = null;
      resolve(resultado);
    });
  });
  aberta = { janela, promessa };
  janela.loadURL(pagina).catch(() => janela.close());
  return promessa;
}

module.exports = { abrirConfiguracao, testarToken };
