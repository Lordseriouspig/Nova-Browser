const { app, BrowserWindow, ipcMain, protocol, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Register nova:// scheme as privileged before app ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'nova',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: false
    }
  }
]);

// Initialize Sentry for main process error tracking
const Sentry = require("@sentry/electron/main");
Sentry.init({
  dsn: "https://ebf0e69b9cea5c343f5b90005b9f214c@o4509766495043584.ingest.de.sentry.io/4509766498713680",
  environment: process.env.NODE_ENV || 'development',
  integrations: [
    // Add any specific integrations you need
  ],
});

// Initialize electron-store
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
    'download-location': path.join(os.homedir(), 'Downloads'),
  }
});

// Store for download history
const downloadsStore = new Store({
  name: 'nova-downloads',
  defaults: {
    'downloads': []
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

// IPC handler for refreshing bookmarks bar
ipcMain.on('refresh-bookmarks-bar', (event) => {
  // Forward the refresh request to all renderer processes
  const allWindows = BrowserWindow.getAllWindows();
  allWindows.forEach(window => {
    window.webContents.send('refresh-bookmarks-bar');
  });
});

// IPC handlers for download management
ipcMain.handle('get-downloads', async () => {
  try {
    return downloadsStore.get('downloads', []);
  } catch (error) {
    console.error('Failed to get downloads:', error);
    return [];
  }
});

ipcMain.handle('clear-downloads', async () => {
  try {
    downloadsStore.set('downloads', []);
    return true;
  } catch (error) {
    console.error('Failed to clear downloads:', error);
    return false;
  }
});

ipcMain.handle('open-download-location', async (event, downloadPath) => {
  try {
    if (fs.existsSync(downloadPath)) {
      shell.showItemInFolder(downloadPath);
    } else {
      // If file doesn't exist, open the downloads folder
      const downloadsPath = settingsStore.get('download-location', path.join(os.homedir(), 'Downloads'));
      shell.openPath(downloadsPath);
    }
    return true;
  } catch (error) {
    console.error('Failed to open download location:', error);
    return false;
  }
});

ipcMain.handle('remove-download-item', async (event, downloadId) => {
  try {
    const downloads = downloadsStore.get('downloads', []);
    const filteredDownloads = downloads.filter(download => download.id !== downloadId);
    downloadsStore.set('downloads', filteredDownloads);
    return true;
  } catch (error) {
    console.error('Failed to remove download item:', error);
    return false;
  }
});

// Track active download items for cancellation
const activeDownloads = new Map();

ipcMain.handle('cancel-download', async (event, downloadId) => {
  try {
    const downloadItem = activeDownloads.get(downloadId);
    if (downloadItem && !downloadItem.isCompleted()) {
      downloadItem.cancel();
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to cancel download:', error);
    return false;
  }
});

// Register as default protocol handler for nova://
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('nova', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('nova');
}

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  // Handle nova:// protocol on Windows/Linux
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.show();
      
      const novaUrl = commandLine.find(arg => arg.startsWith('nova://'));
      if (novaUrl) {
        setTimeout(() => {
          mainWindow.webContents.send('open-nova-url', novaUrl);
        }, 100);
      }
    }
  });

  // Handle nova:// protocol on mac
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (url.startsWith('nova://')) {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        mainWindow.show();
        
        setTimeout(() => {
          mainWindow.webContents.send('open-nova-url', url);
        }, 100);
      }
    }
  });

  app.whenReady().then(() => {
    // Register nova:// protocol with modern handle method
    protocol.handle('nova', (request) => {
      const url = new URL(request.url);
      
      let page;
      if (url.hostname && url.pathname && url.pathname !== '/') {
        page = url.hostname + url.pathname;
      } else {
        page = url.hostname;
      }
      
      // Security: Sanitize the page input to prevent path traversal
      if (!page || typeof page !== 'string') {
        console.warn('[Nova Protocol] Invalid page parameter');
        return new Response('Invalid page parameter', { 
          status: 400, 
          headers: { 'content-type': 'text/plain' } 
        });
      }
      
      // Remove any path traversal attempts and normalize
      const sanitizedPage = page
        .replace(/\.\./g, '') // Remove all .. sequences
        .replace(/[\\]/g, '/') // Normalize backslashes to forward slashes
        .replace(/\/+/g, '/') // Remove duplicate slashes
        .replace(/[^a-zA-Z0-9\-_./]/g, ''); // Only allow safe characters including forward slash
      
      // Validate that sanitized page is not empty and matches expected pattern
      if (!sanitizedPage || sanitizedPage.length === 0) {
        console.warn('[Nova Protocol] Empty or invalid page after sanitization');
        return new Response('Empty or invalid page', { 
          status: 400, 
          headers: { 'content-type': 'text/plain' } 
        });
      }
      
      // Whitelist of allowed pages/files to further restrict access
      const allowedPages = [
        'home', 'about', 'settings', 'bookmarks', 'history', 'downloads', 'test', '404', 'error',
        'shared/theme.css', 'shared/theme.js'
      ];
      
      // Allow all assets/* requests (they are already validated by path security)
      const isAssetRequest = sanitizedPage.startsWith('assets/');
      const isAllowed = isAssetRequest || allowedPages.some(allowed => 
        sanitizedPage === allowed || 
        sanitizedPage === allowed.replace(/\//g, '') ||
        (allowed.includes('/') && sanitizedPage === allowed)
      );
      
      if (!isAllowed) {
        // Return error page for unauthorized access attempts
        const errorPagePath = path.join(__dirname, '../renderer/nova-pages', 'error.html');
        if (fs.existsSync(errorPagePath)) {
          let htmlContent = fs.readFileSync(errorPagePath, 'utf8');
          // Inject error parameters directly into the HTML
          const errorParams = {
            code: 'nova-404',
            url: encodeURIComponent('nova://' + sanitizedPage),
            message: encodeURIComponent('Nova page not found')
          };
          const errorScript = `
            <script>
              // Override URL parameters for error page
              window.location.search = '?code=${errorParams.code}&url=${errorParams.url}&message=${errorParams.message}';
            </script>
          `;
          htmlContent = htmlContent.replace('</head>', errorScript + '</head>');
          return new Response(htmlContent, {
            headers: { 'content-type': 'text/html' }
          });
        } else {
          return new Response('Page not found', { 
            status: 404, 
            headers: { 'content-type': 'text/plain' } 
          });
        }
      }
      
      try {
        // Define allowed directory once for all security checks
        const allowedDir = path.resolve(__dirname, '../renderer/nova-pages');
        
        // Check if it's a CSS or JS file (using sanitized page)
        if (sanitizedPage.endsWith('.css')) {
          const cssPath = path.join(__dirname, '../renderer/nova-pages', sanitizedPage);
          
          // Additional security: ensure the resolved path is within our directory
          const resolvedPath = path.resolve(cssPath);
          if (!resolvedPath.startsWith(allowedDir)) {
            console.warn('[Nova Protocol] Path traversal attempt blocked:', cssPath);
            return new Response('Path traversal blocked', { 
              status: 403, 
              headers: { 'content-type': 'text/plain' } 
            });
          }
          
          if (fs.existsSync(resolvedPath)) {
            const cssContent = fs.readFileSync(resolvedPath, 'utf8');
            return new Response(cssContent, {
              headers: { 'content-type': 'text/css' }
            });
          }
        }
        
        if (sanitizedPage.endsWith('.js')) {
          const jsPath = path.join(__dirname, '../renderer/nova-pages', sanitizedPage);
          
          // Additional security: ensure the resolved path is within our directory
          const resolvedPath = path.resolve(jsPath);
          if (!resolvedPath.startsWith(allowedDir)) {
            console.warn('[Nova Protocol] Path traversal attempt blocked:', jsPath);
            return new Response('Path traversal blocked', { 
              status: 403, 
              headers: { 'content-type': 'text/plain' } 
            });
          }
          
          if (fs.existsSync(resolvedPath)) {
            const jsContent = fs.readFileSync(resolvedPath, 'utf8');
            return new Response(jsContent, {
              headers: { 'content-type': 'application/javascript' }
            });
          }
        }
        
        // Handle asset requests (images, etc.)
        if (sanitizedPage.startsWith('assets/')) {
          const assetPath = path.join(__dirname, '../../', sanitizedPage);
          const allowedAssetsDir = path.resolve(__dirname, '../../assets');
          const resolvedAssetPath = path.resolve(assetPath);
          
          if (!resolvedAssetPath.startsWith(allowedAssetsDir)) {
            console.warn('[Nova Protocol] Asset path traversal attempt blocked:', assetPath);
            return new Response('Asset path traversal blocked', { 
              status: 403, 
              headers: { 'content-type': 'text/plain' } 
            });
          }
          
          if (fs.existsSync(resolvedAssetPath)) {
            const assetContent = fs.readFileSync(resolvedAssetPath);
            let mimeType = 'application/octet-stream';
            
            const ext = path.extname(resolvedAssetPath).toLowerCase();
            switch (ext) {
              case '.png': mimeType = 'image/png'; break;
              case '.jpg':
              case '.jpeg': mimeType = 'image/jpeg'; break;
              case '.gif': mimeType = 'image/gif'; break;
              case '.svg': mimeType = 'image/svg+xml'; break;
              case '.ico': mimeType = 'image/x-icon'; break;
              case '.webp': mimeType = 'image/webp'; break;
              case '.css': mimeType = 'text/css'; break;
              case '.js': mimeType = 'application/javascript'; break;
            }
            
            return new Response(assetContent, {
              headers: { 'content-type': mimeType }
            });
          } else {
            console.warn('[Nova Protocol] Asset not found:', resolvedAssetPath);
            return new Response('Asset not found', { 
              status: 404, 
              headers: { 'content-type': 'text/plain' } 
            });
          }
        }
        
        // Handle HTML pages (using sanitized page)
        const novaPagePath = path.join(__dirname, '../renderer/nova-pages', `${sanitizedPage}.html`);
        
        // Additional security: ensure the resolved path is within our directory
        const resolvedHtmlPath = path.resolve(novaPagePath);
        if (!resolvedHtmlPath.startsWith(allowedDir)) {
          console.warn('[Nova Protocol] Path traversal attempt blocked:', novaPagePath);
          return new Response('Path traversal blocked', { 
            status: 403, 
            headers: { 'content-type': 'text/plain' } 
          });
        }
        
        if (fs.existsSync(resolvedHtmlPath)) {
          let htmlContent = fs.readFileSync(resolvedHtmlPath, 'utf8');
          
          // Replace placeholders (use sanitized page for safety)
          htmlContent = htmlContent
            .replace(/\{\{PAGE\}\}/g, sanitizedPage)
            .replace(/\{\{TIMESTAMP\}\}/g, new Date().toISOString())
            .replace(/\{\{VERSION\}\}/g, '1.0.0');
          
          return new Response(htmlContent, {
            headers: { 'content-type': 'text/html' }
          });
        } else {
          // Load 404 page
          const notFoundPath = path.join(__dirname, '../renderer/nova-pages', '404.html');
          const resolved404Path = path.resolve(notFoundPath);
          if (resolved404Path.startsWith(allowedDir) && fs.existsSync(resolved404Path)) {
            let htmlContent = fs.readFileSync(resolved404Path, 'utf8');
            htmlContent = htmlContent.replace(/\{\{PAGE\}\}/g, sanitizedPage);
            return new Response(htmlContent, {
              headers: { 'content-type': 'text/html' }
            });
          } else {
            // Fallback 404
            const fallback404 = `
              <!DOCTYPE html>
              <html>
              <head><title>Not Found - Nova Browser</title></head>
              <body>
                <h1>Page Not Found</h1>
                <p>Could not load nova://${sanitizedPage}</p>
                <p><a href="nova://home">Go to Nova Home</a></p>
              </body>
              </html>
            `;
            return new Response(fallback404, {
              headers: { 'content-type': 'text/html' }
            });
          }
        }
      } catch (error) {
        console.error('[Nova Protocol] Error handling nova:// request:', error);
        return new Response('Internal server error', { 
          status: 500, 
          headers: { 'content-type': 'text/plain' } 
        });
      }
    });
    
    // Function to generate unique filename when file already exists
    function generateUniqueFilename(downloadLocation, originalFilename) {
      const fullPath = path.join(downloadLocation, originalFilename);
      
      // If file doesn't exist, return original filename
      if (!fs.existsSync(fullPath)) {
        return originalFilename;
      }
      
      // Parse filename and extension
      const ext = path.extname(originalFilename);
      const nameWithoutExt = path.basename(originalFilename, ext);
      
      let counter = 1;
      let newFilename;
      let newPath;
      
      // Keep incrementing until we find a unique filename
      do {
        newFilename = `${nameWithoutExt} (${counter})${ext}`;
        newPath = path.join(downloadLocation, newFilename);
        counter++;
      } while (fs.existsSync(newPath));
      
      return newFilename;
    }
    
    // Set up download handling on the default session (used by webviews)
    session.defaultSession.on('will-download', (event, item, webContents) => {
      console.log('[Nova Main] Download started:', item.getFilename(), 'from', item.getURL());
      
      const downloadLocation = settingsStore.get('download-location', path.join(os.homedir(), 'Downloads'));
      const originalFilename = item.getFilename();
      
      // Generate unique filename if file already exists
      const uniqueFilename = generateUniqueFilename(downloadLocation, originalFilename);
      const savePath = path.join(downloadLocation, uniqueFilename);
      
      // Ensure download directory exists
      if (!fs.existsSync(downloadLocation)) {
        fs.mkdirSync(downloadLocation, { recursive: true });
      }
      
      item.setSavePath(savePath);
      
      // Create download item for tracking
      const downloadItem = {
        id: String(Date.now() + Math.random()), // Simple unique ID as string
        filename: uniqueFilename,
        url: item.getURL(),
        totalBytes: item.getTotalBytes(),
        receivedBytes: 0,
        path: savePath,
        state: 'in_progress',
        startTime: new Date().toISOString(),
        endTime: null,
        cancelled: false
      };
      
      console.log('[Nova Main] Created download item:', downloadItem);
      
      // Track active download for cancellation
      activeDownloads.set(downloadItem.id, item);
      
      // Add to downloads list
      const downloads = downloadsStore.get('downloads', []);
      downloads.unshift(downloadItem);
      downloadsStore.set('downloads', downloads);
      
      // Get the main window to send notifications
      const allWindows = BrowserWindow.getAllWindows();
      const mainWindow = allWindows[0]; // Get the first (main) window
      
      if (mainWindow) {
        // Notify renderer of new download
        mainWindow.webContents.send('download-started', downloadItem);
      }
      
      item.on('updated', (event, state) => {
        downloadItem.receivedBytes = item.getReceivedBytes();
        downloadItem.state = state;
        
        // Update download in store
        const currentDownloads = downloadsStore.get('downloads', []);
        const index = currentDownloads.findIndex(d => d.id === downloadItem.id);
        if (index !== -1) {
          currentDownloads[index] = downloadItem;
          downloadsStore.set('downloads', currentDownloads);
        }
        
        // Notify renderer of progress
        if (mainWindow) {
          mainWindow.webContents.send('download-updated', downloadItem);
        }
      });
      
      item.once('done', (event, state) => {
        downloadItem.state = state;
        downloadItem.endTime = new Date().toISOString();
        
        // Remove from active downloads
        activeDownloads.delete(downloadItem.id);
        
        // Final update in store
        const currentDownloads = downloadsStore.get('downloads', []);
        const index = currentDownloads.findIndex(d => d.id === downloadItem.id);
        if (index !== -1) {
          currentDownloads[index] = downloadItem;
          downloadsStore.set('downloads', currentDownloads);
        }
        
        // Notify renderer of completion
        if (mainWindow) {
          mainWindow.webContents.send('download-completed', downloadItem);
        }
      });
    });
    
    createWindow();
  });
}

function createWindow() {
  const iconPath = { win32: path.join(__dirname, '../../assets', 'icon', 'icon.ico'), darwin: path.join(__dirname, '../../assets', 'icon', 'icon.icns'), linux: path.join(__dirname, '../../assets', 'icon', 'icon.png') }[process.platform];
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '../renderer/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      enableRemoteModule: false,
      sandbox: false
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

// Handle clearing browsing data on exit
app.on('before-quit', async (event) => {
  try {
    const clearDataOnExit = await settingsStore.get('clear-data', false);
    if (clearDataOnExit) {
      const session = require('electron').session.defaultSession;
      
      await session.clearCache();
      await session.clearStorageData({
        storages: ['cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers']
      });
    }
  } catch (error) {
    console.error('[Nova Main] Error clearing browsing data:', error);
  }
});