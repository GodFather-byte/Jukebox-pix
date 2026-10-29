const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Abre o jukebox quando o computador liga (depois do login do usuário). Windows e macOS usam o recurso do
// Electron; no Linux é um atalho em ~/.config/autostart (padrão XDG, vale para GNOME, KDE, XFCE etc.).
const NOME_LINUX = 'jukebox-pix.desktop';

function atalhoLinux(executavel) {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Jukebox Pix',
    'Comment=Abre o jukebox ao ligar o computador',
    `Exec="${executavel.replace(/"/g, '\\"')}"`,
    'X-GNOME-Autostart-enabled=true',
    'Terminal=false',
    '',
  ].join('\n');
}

// `executavel`: no AppImage é o próprio arquivo .AppImage (process.env.APPIMAGE), não o binário extraído.
function aplicarLinux(ligar, executavel, pasta = path.join(os.homedir(), '.config', 'autostart')) {
  const arquivo = path.join(pasta, NOME_LINUX);
  if (!ligar) {
    fs.rmSync(arquivo, { force: true });
    return;
  }
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(arquivo, atalhoLinux(executavel));
}

function aplicarInicioAutomatico(app, ligar) {
  if (!app.isPackaged) return; // rodando do código: registraria o Electron de desenvolvimento
  if (process.platform === 'linux') aplicarLinux(ligar, process.env.APPIMAGE || process.execPath);
  else app.setLoginItemSettings({ openAtLogin: ligar });
}

module.exports = { aplicarInicioAutomatico, aplicarLinux, atalhoLinux };
