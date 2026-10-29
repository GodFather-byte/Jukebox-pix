const { app, BrowserWindow, Menu, dialog, shell, utilityProcess, clipboard } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createSettings, readSettings, externalURL, localURL } = require('./settings.cjs');
const { ferramentasEmbutidas, situacaoFerramentas } = require('./ferramentas.cjs');
const { abrirConfiguracao } = require('./configuracao.cjs');

app.setName('Jukebox Pix');
const smoke = process.argv.includes('--desktop-smoke-test');
const dataArg = process.argv.find((arg) => arg.startsWith('--desktop-data-dir='));
if (smoke && dataArg) {
  const directory = dataArg.slice('--desktop-data-dir='.length);
  if (!path.isAbsolute(directory)) app.exit(1);
  else app.setPath('userData', directory);
}
const dataDir = app.getPath('userData');
let backend;
let mainWindow;
let quitting = false;
let stopped = false;
let exitCode = 0;
let startupError;
let logFile;
let ferramentas = {};
let configurando = false; // a tela de configuração fecha antes da janela principal abrir: não é para sair

// No instalador as ferramentas ficam em resources/ferramentas; rodando do código, em ferramentas/<win|linux>.
function pastaFerramentas() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'ferramentas')
    : path.join(app.getAppPath(), 'ferramentas', process.platform === 'win32' ? 'win' : 'linux');
}

// Reabre o aplicativo para o servidor subir com a configuração nova.
async function configurarEReiniciar() {
  if (await abrirConfiguracao({ dataDir, ferramentas }) === 'salvo') {
    app.relaunch();
    app.quit();
  }
}

function log(event) {
  // Somente eventos controlados: nunca copie stdout/stderr, URLs ou erros com credenciais para o log.
  if (logFile) fs.appendFileSync(logFile, `${new Date().toISOString()} ${event}\n`, { mode: 0o600 });
}

function smokeResult(result) {
  if (smoke) fs.writeFileSync(path.join(dataDir, 'smoke-result.json'), JSON.stringify(result));
}

function fail(code) {
  if (quitting) return;
  startupError = code;
  exitCode = 1;
  log(code === 'EADDRINUSE' ? 'PORTA_OCUPADA' : 'FALHA_BACKEND');
  smokeResult({ ok: false, code });
  if (!smoke) dialog.showErrorBox('Não foi possível iniciar o Jukebox Pix',
    code === 'EADDRINUSE'
      ? 'A porta configurada já está em uso. Feche o outro programa ou troque a porta em Jukebox Pix → Configurações (Avançado). Nenhum servidor existente foi aberto.'
      : 'O servidor não iniciou ou parou inesperadamente. Confira a configuração (menu Jukebox Pix → Configurações), o player (mpv/VLC) e a pasta de dados. Nenhuma credencial foi registrada no log.');
  app.quit();
}

function windowFor(url, title) {
  const origin = new URL(url).origin;
  const win = new BrowserWindow({
    width: 1280, height: 850, title,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false },
  });
  const guard = (event, destination) => {
    if (!localURL(destination, origin)) event.preventDefault();
  };
  win.webContents.on('will-navigate', guard);
  win.webContents.on('will-redirect', guard);
  win.webContents.setWindowOpenHandler(({ url: destination }) => {
    if (externalURL(destination)) shell.openExternal(destination).catch(() => {});
    return { action: 'deny' };
  });
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  // A tela cheia do telão é o próprio aplicativo. O resto (câmera, notificação, microfone) continua negado.
  const permitir = (_contents, permission) => permission === 'fullscreen';
  win.webContents.session.setPermissionRequestHandler((contents, permission, callback) => callback(permitir(contents, permission)));
  win.webContents.session.setPermissionCheckHandler(permitir);
  win.webContents.on('page-title-updated', (event) => event.preventDefault());
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  win.loadURL(url).catch(() => fail('FRONTEND'));
  return win;
}

function installMenu(origin, info, settings) {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Jukebox Pix', submenu: [
      { label: 'Tela do jukebox', click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(`${origin}/tela`);
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        } else mainWindow = windowFor(`${origin}/tela`, settings.test ? 'Jukebox Pix — MODO DE TESTE LOCAL' : 'Jukebox Pix');
      } },
      { label: 'Catálogo do cliente', click: () => windowFor(`${origin}/`, 'Jukebox Pix — Catálogo') },
      { label: 'Painel administrativo', click: () => windowFor(`${origin}/admin`, 'Jukebox Pix — Administração') },
      { label: 'Abrir telão', click: () => windowFor(`${origin}/tela`, 'Jukebox Pix — Telão') },
      { label: 'Endereço dos clientes / rede', click: async () => {
        const address = settings.test ? `${origin} (teste: somente neste computador)` : info.clientUrl;
        const { response } = await dialog.showMessageBox({
          type: 'info', title: 'Acesso dos clientes', buttons: ['Fechar', 'Copiar endereço'],
          message: settings.test ? 'MODO DE TESTE — créditos grátis; sem acesso pela LAN.' : 'Celulares na mesma rede Wi-Fi',
          detail: `${address}\nPlayer: ${info.player}${info.player === 'sim' ? ' — SIMULADO, nenhum áudio é reproduzido' : ''}\n\nNo Windows, permita o aplicativo somente em redes privadas no firewall. Não abra portas no roteador nem exponha o painel à internet.`,
        });
        if (response === 1) clipboard.writeText(settings.test ? origin : info.clientUrl);
      } },
      { type: 'separator' },
      { label: 'Configurações…', click: configurarEReiniciar },
      { label: 'Abrir pasta de dados e logs', click: () => shell.openPath(dataDir) },
      { label: 'Editar configuração avançada (.env)', click: () => shell.openPath(path.join(dataDir, '.env')) },
      { label: 'Sobre a configuração', click: () => dialog.showMessageBox({
        type: 'info', message: 'Feche o aplicativo antes de editar ou migrar dados.',
        detail: `Dados e configuração:\n${dataDir}\n\nSenha, Pix e porta mudam em Jukebox Pix → Configurações. O resto fica no arquivo .env, que vale na próxima abertura. Nunca compartilhe esse arquivo.`,
      }) },
      { type: 'separator' }, { label: 'Sair', click: () => app.quit() },
    ] },
    { label: 'Exibir', submenu: [{ role: 'reload', label: 'Recarregar' }, { role: 'togglefullscreen', label: 'Tela cheia' }] },
  ]));
}

async function run() {
  fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true, mode: 0o700 });
  logFile = path.join(dataDir, 'logs', 'desktop.log');
  // Limite simples para que o registro sanitizado não cresça indefinidamente.
  if (fs.existsSync(logFile) && fs.statSync(logFile).size > 1024 * 1024) fs.renameSync(logFile, `${logFile}.old`);
  ferramentas = ferramentasEmbutidas(pastaFerramentas(), dataDir);
  const envFile = path.join(dataDir, '.env');
  if (smoke && !fs.existsSync(envFile)) createSettings(dataDir, 'teste');
  // Primeira vez ou configuração inválida: a tela de configuração no lugar de editar o .env na mão.
  let erroConfig = fs.existsSync(envFile) ? null : '';
  let settings;
  for (;;) {
    if (erroConfig !== null) {
      if (smoke) {
        smokeResult({ ok: false, code: 'CONFIG' });
        exitCode = 1;
        return app.quit();
      }
      configurando = true;
      // Fica ligado até a janela principal abrir: o "todas as janelas fechadas" da tela chega depois daqui.
      if (await abrirConfiguracao({ dataDir, ferramentas, erro: erroConfig }) !== 'salvo') return app.quit();
    }
    try {
      settings = readSettings(dataDir, process.env, ferramentas);
      break;
    } catch (error) {
      erroConfig = `A configuração precisa de ajuste: ${error.message}`;
    }
  }
  if (!settings.test && !smoke && !situacaoFerramentas(settings.env).player) {
    await dialog.showMessageBox({ type: 'warning', message: 'Falta o player de áudio',
      detail: process.platform === 'win32'
        ? 'Nenhum mpv ou VLC foi encontrado. Instale o VLC (videolan.org) e abra o Jukebox Pix de novo.'
        : 'Nenhum mpv ou VLC foi encontrado. Instale com "sudo apt install mpv" e abra o Jukebox Pix de novo.' });
    return app.quit();
  }
  // Quem acabou de escolher "Só experimentar" na tela não precisa confirmar de novo.
  if (settings.test && !smoke && erroConfig === null) {
    const { response } = await dialog.showMessageBox({
      type: 'warning', message: 'MODO DE TESTE LOCAL',
      detail: 'Os créditos são grátis. O player pode ser simulado (sem áudio). Os celulares na rede não poderão acessar. Para atender clientes, use Jukebox Pix → Configurações.',
      buttons: ['Continuar teste local', 'Fechar'], defaultId: 1, cancelId: 1,
    });
    if (response !== 0) return app.quit();
  }
  log('INICIANDO');
  backend = utilityProcess.fork(path.join(__dirname, 'backend.cjs'), [], {
    cwd: dataDir, env: settings.env, stdio: 'ignore', serviceName: 'Servidor Jukebox Pix',
  });
  const heartbeat = setInterval(() => {
    if (!quitting && backend.pid) backend.postMessage({ type: 'heartbeat' });
  }, 2000);
  const timeout = setTimeout(() => fail('TIMEOUT'), 60000);
  backend.once('exit', (code) => {
    clearInterval(heartbeat);
    clearTimeout(timeout);
    stopped = true;
    if (quitting) {
      if (code !== 0) {
        exitCode = 1;
        if (!startupError) smokeResult({ ok: false, code: 'BACKEND_EXIT' });
      }
      log(code === 0 ? 'ENCERRADO' : 'FALHA_ENCERRAMENTO');
      app.exit(exitCode);
    } else fail(startupError || 'EXIT');
  });
  backend.on('message', async (info) => {
    if (quitting) return;
    if (info?.type === 'startup-error') return fail(info.code);
    if (info?.type !== 'ready' || info.port !== settings.port || mainWindow) return;
    clearTimeout(timeout);
    const origin = `http://127.0.0.1:${info.port}`;
    try {
      // Readiness privada acima comprova a posse da porta; HTTP confirma SQLite e arquivos do pacote.
      const health = await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(10000) });
      if (!health.ok || (await health.json()).ok !== true) throw new Error();
      const frontend = await fetch(`${origin}/tela`, { signal: AbortSignal.timeout(10000) });
      if (!frontend.ok || !(await frontend.text()).includes('<div id="raiz">')) throw new Error();
      installMenu(origin, info, settings);
      mainWindow = windowFor(`${origin}/tela`, settings.test ? 'Jukebox Pix — MODO DE TESTE LOCAL' : 'Jukebox Pix');
      configurando = false;
      if (!smoke) mainWindow.maximize();
      log('PRONTO');
      if (smoke) {
        mainWindow.webContents.once('did-finish-load', async () => {
          try {
            // Aguarda React montar; baixar index.html sozinho não valida a interface empacotada.
            let rendered = false;
            for (let attempt = 0; attempt < 100; attempt++) {
              rendered = await mainWindow.webContents.executeJavaScript('Boolean(document.querySelector("#raiz")?.children.length)');
              if (rendered) break;
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
            if (!rendered) return fail('RENDERER');
            fs.writeFileSync(path.join(dataDir, 'smoke-ready.json'), JSON.stringify({ ok: true, port: info.port }));
            setTimeout(() => {
              smokeResult({ ok: true, sqlite: true, frontend: true, player: info.player });
              app.quit();
            }, 6000);
          } catch { fail('RENDERER'); }
        });
      }
    } catch { fail('READINESS'); }
  });
}

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
  app.on('window-all-closed', () => { if (!configurando) app.quit(); });
  app.on('before-quit', (event) => {
    if (stopped || !backend) {
      if (exitCode) app.exit(exitCode);
      return;
    }
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    log('ENCERRANDO');
    backend.postMessage({ type: 'shutdown' });
    setTimeout(() => {
      // Último recurso em falha do backend, incluindo descendentes no Windows.
      if (process.platform === 'win32' && backend.pid) {
        spawnSync('taskkill', ['/PID', String(backend.pid), '/T', '/F'], { windowsHide: true, timeout: 5000, stdio: 'ignore' });
      }
      backend.kill();
      exitCode = 1;
      smokeResult({ ok: false, code: 'SHUTDOWN_TIMEOUT' });
      app.exit(1);
    }, 8000).unref();
  });
  app.whenReady().then(run).catch(() => fail('DESKTOP'));
  app.on('will-quit', () => { if (exitCode) process.exitCode = exitCode; });
}
