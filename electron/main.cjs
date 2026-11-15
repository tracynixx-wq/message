const { app, BrowserWindow, shell } = require('electron');

const APP_URL = 'https://tracynixx-wq.github.io/message/';
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#090a0c',
    title: 'Message',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') && !url.startsWith('https://tracynixx-wq.github.io/message/')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_URL) && !url.startsWith('https://tracynixx-wq.github.io/message/')) {
      event.preventDefault();
      if (url.startsWith('https://')) shell.openExternal(url);
    }
  });
  mainWindow.loadURL(APP_URL);
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.message.desktop');
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
