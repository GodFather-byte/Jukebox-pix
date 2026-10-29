const { contextBridge, ipcRenderer } = require('electron');

// Única ponte da tela de configuração com o aplicativo: nada de Node na página.
contextBridge.exposeInMainWorld('jukebox', {
  ler: () => ipcRenderer.invoke('config:ler'),
  salvar: (campos) => ipcRenderer.invoke('config:salvar', campos),
  testarToken: (token) => ipcRenderer.invoke('config:testar-token', token),
  copiar: (texto) => ipcRenderer.invoke('config:copiar', texto),
  abrirLink: (url) => ipcRenderer.invoke('config:link', url),
  cancelar: () => ipcRenderer.invoke('config:cancelar'),
});
