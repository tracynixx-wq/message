const { app, BrowserWindow, shell, session, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const APP_URL = 'https://tracynixx-wq.github.io/message/';
// Replaced by the Windows build workflow with the published build number.
const DESKTOP_BUILD = 0;
const TRUSTED_ORIGIN = 'https://tracynixx-wq.github.io';
let mainWindow;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowDowngrade = false;
autoUpdater.allowPrerelease = false;

function sendUpdateStatus(status, extra = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('message:update-status', { status, ...extra });
  }
}

function isTrustedSender(event) {
  try {
    return new URL(event.senderFrame.url).origin === TRUSTED_ORIGIN;
  } catch (_) {
    return false;
  }
}

function registerUpdater() {
  autoUpdater.on('checking-for-update', () => sendUpdateStatus('checking'));
  autoUpdater.on('update-available', info => sendUpdateStatus('available', { version: info.version }));
  autoUpdater.on('update-not-available', () => sendUpdateStatus('not-available'));
  autoUpdater.on('download-progress', progress => sendUpdateStatus('downloading', { percent: progress.percent }));
  autoUpdater.on('update-downloaded', info => sendUpdateStatus('downloaded', { version: info.version }));
  autoUpdater.on('error', error => sendUpdateStatus('error', { error: error && error.message ? error.message : 'Ошибка обновления' }));

  ipcMain.handle('message:update-check', async event => {
    if (!isTrustedSender(event)) throw new Error('Untrusted update request');
    if (!app.isPackaged) return { skipped: true };
    return autoUpdater.checkForUpdates();
  });
  ipcMain.handle('message:update-download', async event => {
    if (!isTrustedSender(event)) throw new Error('Untrusted update request');
    if (!app.isPackaged) throw new Error('Обновление доступно только в установленной версии');
    return autoUpdater.downloadUpdate();
  });
  ipcMain.on('message:update-install', event => {
    if (!isTrustedSender(event) || !app.isPackaged) return;
    autoUpdater.quitAndInstall(false, true);
  });
}

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
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // Keep authentication and site storage in Electron's persistent default profile.
      session: session.defaultSession
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') && !url.startsWith(APP_URL)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_URL)) {
      event.preventDefault();
      if (url.startsWith('https://')) shell.openExternal(url);
    }
  });
  mainWindow.loadURL(APP_URL + '?desktopBuild=' + DESKTOP_BUILD);
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.message.desktop');
  registerUpdater();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
