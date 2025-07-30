const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

// Initialize electron-store in main process for IPC communication
const Store = require('electron-store');
const settingsStore = new Store({
  name: 'nova-settings',
  defaults: {
    'homepage': 'nova://home',
    'search-engine': 'Google',
    'startup-behavior': 'homepage',
    'clear-data': false,
    'block-trackers': true,
    'accept-cookies': 'all',
    'dark-mode': true,
    'bookmarks-bar': true,
    'zoom-level': 100,
    'hardware-acceleration': true,
    'developer-tools': true,
  }
});

// IPC handler for settings requests from main window preload
ipcMain.on('settings-request', (event, request) => {
  const { requestId, action, ...data } = request;
  let success = true;
  let result, error;
  
  try {
    switch (action) {
      case 'get':
        result = settingsStore.get(data.key, data.defaultValue);
        break;
      case 'set':
        settingsStore.set(data.key, data.value);
        result = true;
        break;
      case 'getAll':
        result = settingsStore.store;
        break;
      case 'setMultiple':
        for (const [key, value] of Object.entries(data.settings)) {
          settingsStore.set(key, value);
        }
        result = true;
        break;
      case 'remove':
        settingsStore.delete(data.key);
        result = true;
        break;
      case 'clear':
        settingsStore.clear();
        result = true;
        break;
      case 'has':
        result = settingsStore.has(data.key);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (err) {
    success = false;
    error = err.message;
  }
  
  event.reply('settings-response', { requestId, success, data: result, error });
});

// Register as default protocol handler for nova://
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('nova', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('nova');
}

// This duplicate registration is removed - protocol registration happens in the main app.whenReady() below

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

  app.whenReady().then(() => {
    // Register protocol first, then create window
    protocol.registerStringProtocol('nova', (request, callback) => {
      const url = new URL(request.url);
      console.log('[Nova Protocol] Full URL:', request.url);
      console.log('[Nova Protocol] Parsed - hostname:', url.hostname, 'pathname:', url.pathname);
      
      // For nova://shared/theme.css, hostname="shared" and pathname="/theme.css"
      // We need to combine them properly
      let page;
      if (url.hostname && url.pathname && url.pathname !== '/') {
        page = url.hostname + url.pathname; // "shared/theme.css"
      } else {
        page = url.hostname; // Just "home" for nova://home
      }
      
      console.log('[Nova Protocol] Handling nova:// request for page:', page);
      
      try {
        // Check if it's a CSS or JS file
        if (page.endsWith('.css')) {
          const cssPath = path.join(__dirname, '../renderer/nova-pages', page);
          console.log('[Nova Protocol] Looking for CSS at:', cssPath);
          
          if (fs.existsSync(cssPath)) {
            const cssContent = fs.readFileSync(cssPath, 'utf8');
            console.log('[Nova Protocol] ✅ Successfully loaded CSS:', page);
            callback({ data: cssContent, mimeType: 'text/css' });
            return;
          }
        }
        
        if (page.endsWith('.js')) {
          const jsPath = path.join(__dirname, '../renderer/nova-pages', page);
          console.log('[Nova Protocol] Looking for JS at:', jsPath);
          
          if (fs.existsSync(jsPath)) {
            const jsContent = fs.readFileSync(jsPath, 'utf8');
            console.log('[Nova Protocol] ✅ Successfully loaded JS:', page);
            callback({ data: jsContent, mimeType: 'application/javascript' });
            return;
          }
        }
        
        // Handle HTML pages
        const novaPagePath = path.join(__dirname, '../renderer/nova-pages', `${page}.html`);
        console.log('[Nova Protocol] Looking for page at:', novaPagePath);
        
        if (fs.existsSync(novaPagePath)) {
          let htmlContent = fs.readFileSync(novaPagePath, 'utf8');
          
          // Replace placeholders
          htmlContent = htmlContent
            .replace(/\{\{PAGE\}\}/g, page)
            .replace(/\{\{TIMESTAMP\}\}/g, new Date().toISOString())
            .replace(/\{\{VERSION\}\}/g, '1.0.0');
          
          console.log('[Nova Protocol] ✅ Successfully loaded nova:// page:', page);
          callback({ data: htmlContent, mimeType: 'text/html' });
        } else {
          // Load 404 page
          const notFoundPath = path.join(__dirname, '../renderer/nova-pages', '404.html');
          if (fs.existsSync(notFoundPath)) {
            let htmlContent = fs.readFileSync(notFoundPath, 'utf8');
            htmlContent = htmlContent.replace(/\{\{PAGE\}\}/g, page);
            console.log('[Nova Protocol] 📄 Loaded 404 page for:', page);
            callback({ data: htmlContent, mimeType: 'text/html' });
          } else {
            // Fallback 404
            const fallback404 = `
              <!DOCTYPE html>
              <html>
              <head><title>Not Found - Nova Browser</title></head>
              <body>
                <h1>Page Not Found</h1>
                <p>Could not load nova://${page}</p>
                <p><a href="nova://home">Go to Nova Home</a></p>
              </body>
              </html>
            `;
            console.log('[Nova Protocol] 🔄 Using fallback 404 for:', page);
            callback({ data: fallback404, mimeType: 'text/html' });
          }
        }
      } catch (error) {
        console.error('[Nova Protocol] ❌ Error handling nova:// request:', error);
        callback({ error: error.code || -6 });
      }
    });
    
    createWindow();
  });
}

function createWindow() {
  const iconPath = { win32: path.join(__dirname, 'assets', 'logo', 'icon.ico'), darwin: path.join(__dirname, 'assets', 'logo', 'icon.icns'), linux: path.join(__dirname, 'assets', 'logo', 'icon.png') }[process.platform];
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '../renderer/preload.js'),
      nodeIntegration: false,       // Secure: no Node.js in renderer
      contextIsolation: true,       // Secure: isolated contexts
      webviewTag: true,             // Enable webview for website content
      enableRemoteModule: false,     // Additional security
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Open DevTools for debugging (remove this in production)
  mainWindow.webContents.openDevTools();

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

// Handle clearing browsing data on exit
app.on('before-quit', async (event) => {
  try {
    // Check if clear data on exit is enabled
    const clearDataOnExit = await settingsStore.get('clear-data', false);
    if (clearDataOnExit) {
      console.log('[Nova Main] Clearing browsing data on exit...');
      
      // Clear session data
      const session = require('electron').session.defaultSession;
      
      // Clear cache, cookies, and storage data
      await session.clearCache();
      await session.clearStorageData({
        storages: ['cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers']
      });
      
      console.log('[Nova Main] ✅ Browsing data cleared successfully');
    }
  } catch (error) {
    console.error('[Nova Main] ❌ Error clearing browsing data:', error);
  }
});