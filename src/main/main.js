const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Register as default protocol handler for nova://
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('nova', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('nova');
}

// Prevent multiple instances - always use existing window
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // If we didn't get the lock, quit immediately without showing any window
  app.quit();
} else {
  // Handle nova:// protocol on Windows/Linux
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window instead and handle the protocol
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.show(); // Ensure window is visible
      
      // Find nova:// URL in command line arguments
      const novaUrl = commandLine.find(arg => arg.startsWith('nova://'));
      if (novaUrl) {
        // Small delay to ensure window is ready
        setTimeout(() => {
          mainWindow.webContents.send('open-nova-url', novaUrl);
        }, 100);
      }
    }
  });

  // Handle nova:// protocol on macOS
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (url.startsWith('nova://')) {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        mainWindow.show(); // Ensure window is visible
        
        // Small delay to ensure window is ready
        setTimeout(() => {
          mainWindow.webContents.send('open-nova-url', url);
        }, 100);
      }
    }
  });

  app.whenReady().then(createWindow);
}

function createWindow() {
  const iconPath = { win32: path.join(__dirname, 'assets', 'logo', 'icon.ico'), darwin: path.join(__dirname, 'assets', 'logo', 'icon.icns'), linux: path.join(__dirname, 'assets', 'logo', 'icon.png') }[process.platform];
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '../renderer/preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Handle nova:// URL if app was launched with one
  const novaUrl = process.argv.find(arg => arg.startsWith('nova://'));
  if (novaUrl) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('open-nova-url', novaUrl);
    });
  }
}

// Handle window close request from renderer
ipcMain.on('close-window', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    window.close();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});