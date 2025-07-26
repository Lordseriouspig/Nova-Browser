const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const iconPath = { win32: path.join(__dirname, 'assets', 'logo', 'icon.ico'), darwin: path.join(__dirname, 'assets', 'logo', 'icon.icns'), linux: path.join(__dirname, 'assets', 'logo', 'icon.png') }[process.platform];
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '../renderer/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});