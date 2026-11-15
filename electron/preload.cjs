const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('messageDesktop', {
  checkForUpdates: () => ipcRenderer.invoke('message:update-check'),
  downloadUpdate: () => ipcRenderer.invoke('message:update-download'),
  installUpdate: () => ipcRenderer.send('message:update-install'),
  onUpdateStatus: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('message:update-status', listener);
    ipcRenderer.invoke('message:update-check').catch(error => {
      callback({ status: 'error', error: error && error.message ? error.message : 'Не удалось проверить обновления' });
    });
    return () => ipcRenderer.removeListener('message:update-status', listener);
  }
});
