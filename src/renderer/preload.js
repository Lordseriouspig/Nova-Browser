const { contextBridge, ipcRenderer } = require('electron');

// Increase max listeners
ipcRenderer.setMaxListeners(20);

// Track pending requests
const pendingRequests = new Map();

// Set up a single persistent listener for settings responses
let settingsResponseListenerSetup = false;

function setupSettingsResponseListener() {
  if (!settingsResponseListenerSetup) {
    ipcRenderer.on('settings-response', (event, response) => {
      const { requestId, success, data, error } = response;
      
      if (pendingRequests.has(requestId)) {
        const { resolve, reject } = pendingRequests.get(requestId);
        pendingRequests.delete(requestId);
        
        if (success) {
          resolve(data);
        } else {
          reject(new Error(error || 'Settings request failed'));
        }
      }
    });
    settingsResponseListenerSetup = true;
  }
}

// Initialize the listener for webviews
if (window !== window.parent) {
  setupSettingsResponseListener();
}

// Send settings requests via IPC
function sendSettingsRequest(action, data = {}) {
  return new Promise((resolve, reject) => {
    const requestId = Math.random().toString(36).substr(2, 9);
    const channel = 'settings-request';
    
    const isWebview = window !== window.parent;
    
    pendingRequests.set(requestId, { resolve, reject });
    
    const request = {
      requestId,
      action,
      ...data
    };
    
    try {
      if (isWebview) {
        // In webview, send to host
        ipcRenderer.sendToHost(channel, request);
      } else {
        // In main window, set up the persistent listener if not already done
        setupSettingsResponseListener();
        
        // Send to main process
        ipcRenderer.send(channel, request);
      }
    } catch (error) {
      console.error('[Preload] Failed to send settings request:', error);
      pendingRequests.delete(requestId);
      reject(error);
    }
    
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error(`Settings request timeout for ${action} (requestId: ${requestId})`));
      }
    }, 5000);
  });
}

// Expose API to renderer
contextBridge.exposeInMainWorld('novaAPI', {
  settings: {
    get: async (key, defaultValue) => {
      try {
        const result = await sendSettingsRequest('get', { key, defaultValue });
        return result;
      } catch (error) {
        console.error('[NovaAPI] Settings get failed:', error);
        return defaultValue;
      }
    },
    
    set: async (key, value) => {
      try {
        await sendSettingsRequest('set', { key, value });
        return true;
      } catch (error) {
        console.error('[NovaAPI] Settings set failed:', error);
        return false;
      }
    },
    
    getAll: async () => {
      try {
        const result = await sendSettingsRequest('getAll');
        return result;
      } catch (error) {
        console.error('[NovaAPI] Settings getAll failed:', error);
        return {};
      }
    },
    
    setMultiple: async (settings) => {
      try {
        await sendSettingsRequest('setMultiple', { settings });
        return true;
      } catch (error) {
        console.error('[NovaAPI] Settings setMultiple failed:', error);
        return false;
      }
    },
    
    remove: async (key) => {
      try {
        await sendSettingsRequest('remove', { key });
        return true;
      } catch (error) {
        console.error('[NovaAPI] Settings remove failed:', error);
        return false;
      }
    },
    
    has: async (key) => {
      try {
        const result = await sendSettingsRequest('has', { key });
        return result;
      } catch (error) {
        console.error('[NovaAPI] Settings has failed:', error);
        return false;
      }
    },
    
    clear: async () => {
      try {
        await sendSettingsRequest('clear');
        return true;
      } catch (error) {
        console.error('[NovaAPI] Settings clear failed:', error);
        return false;
      }
    },
    
    getHomepage: async () => {
      try {
        const result = await sendSettingsRequest('get', { key: 'homepage', defaultValue: 'nova://home' });
        return result;
      } catch (error) {
        console.error('[NovaAPI] getHomepage failed:', error);
        return 'nova://home';
      }
    },
    setHomepage: async (url) => {
      try {
        await sendSettingsRequest('set', { key: 'homepage', value: url });
        return true;
      } catch (error) {
        console.error('[NovaAPI] setHomepage failed:', error);
        return false;
      }
    },
    isDarkMode: async () => {
      try {
        const result = await sendSettingsRequest('get', { key: 'dark-mode', defaultValue: false });
        return result;
      } catch (error) {
        console.error('[NovaAPI] isDarkMode failed:', error);
        return false;
      }
    },
    setDarkMode: async (enabled) => {
      try {
        await sendSettingsRequest('set', { key: 'dark-mode', value: enabled });
        return true;
      } catch (error) {
        console.error('[NovaAPI] setDarkMode failed:', error);
        return false;
      }
    }
  },
  
  // Navigation API
  navigation: {
    goTo: (url) => {
      ipcRenderer.sendToHost('navigate', url);
    }
  },
  
  // IPC API
  ipc: {
    send: (channel, ...args) => {
      const validChannels = ['close-window', 'open-nova-url', 'refresh-bookmarks-bar', 'test-sentry'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, ...args);
      }
    },
    
    on: (channel, callback) => {
      const validChannels = ['open-nova-url', 'refresh-bookmarks-bar'];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, callback);
      }
    },
    
    removeAllListeners: (channel) => {
      const validChannels = ['open-nova-url', 'refresh-bookmarks-bar'];
      if (validChannels.includes(channel)) {
        ipcRenderer.removeAllListeners(channel);
      }
    }
  },
  
  // System info
  system: {
    getStoreType: () => 'ipc-based',
    isReady: () => true
  },
  
  // Sentry testing (development only)
  sentry: {
    testError: (testType = 'message') => {
      try {
        switch (testType) {
          case 'js-error':
            // Test renderer process error
            Sentry.captureException(new Error('Test JavaScript error from renderer process'));
            console.log('[Nova Renderer] Sentry JavaScript error test sent');
            break;
          case 'js-crash':
            // Test undefined function call in renderer
            rendererUndefinedFunction();
            break;
          case 'main-error':
            // Test main process error
            ipcRenderer.send('test-sentry', 'js-error');
            break;
          case 'main-crash':
            // Test main process crash
            ipcRenderer.send('test-sentry', 'js-crash');
            break;
          default:
            Sentry.captureMessage('Sentry test message from renderer process', 'info');
            console.log('[Nova Renderer] Sentry test message sent');
        }
      } catch (error) {
        Sentry.captureException(error);
        console.error('[Nova Renderer] Sentry test error:', error);
      }
    }
  }
});


contextBridge.exposeInMainWorld('novaSettings', {
  get: async (key, defaultValue = null) => {
    try {
      const result = await sendSettingsRequest('get', { key, defaultValue });
      return result;
    } catch (error) {
      console.error('[NovaSettings] get failed:', error);
      return defaultValue;
    }
  },
  
  set: async (key, value) => {
    try {
      await sendSettingsRequest('set', { key, value });
      return true;
    } catch (error) {
      console.error('[NovaSettings] set failed:', error);
      return false;
    }
  },
  
  getAll: async () => {
    try {
      const result = await sendSettingsRequest('getAll');
      return result;
    } catch (error) {
      console.error('[NovaSettings] getAll failed:', error);
      return {};
    }
  },
  
  setMultiple: async (settings) => {
    try {
      await sendSettingsRequest('setMultiple', { settings });
      return true;
    } catch (error) {
      console.error('[NovaSettings] setMultiple failed:', error);
      return false;
    }
  },
  
  clear: async () => {
    try {
      await sendSettingsRequest('clear');
      return true;
    } catch (error) {
      console.error('[NovaSettings] clear failed:', error);
      return false;
    }
  },
  
  has: async (key) => {
    try {
      const result = await sendSettingsRequest('has', { key });
      return result;
    } catch (error) {
      console.error('[NovaSettings] has failed:', error);
      return false;
    }
  },
  
  remove: async (key) => {
    try {
      await sendSettingsRequest('remove', { key });
      return true;
    } catch (error) {
      console.error('[NovaSettings] remove failed:', error);
      return false;
    }
  },
  
  reset: async (key) => {
    // Default settings
    const defaults = {
      'homepage': 'nova://home',
      'search-engine': 'Google',
      'startup-behavior': 'homepage',
      'clear-data': false,
      'block-trackers': true,
      'accept-cookies': 'all',
      'dark-mode': false,
      'bookmarks-bar': true,
      'tab-position': 'top',
      'zoom-level': 100,
      'hardware-acceleration': true,
      'developer-tools': true,
      'auto-updates': true
    };
    
    const defaultValue = defaults[key];
    if (defaultValue !== undefined) {
      try {
        await sendSettingsRequest('set', { key, value: defaultValue });
        return true;
      } catch (error) {
        console.error('[NovaSettings] reset failed:', error);
        return false;
      }
    }
    return false;
  },
  
  resetAll: async () => {
    const defaults = {
      'homepage': 'nova://home',
      'search-engine': 'Google',
      'startup-behavior': 'homepage',
      'clear-data': false,
      'block-trackers': true,
      'accept-cookies': 'all',
      'dark-mode': false,
      'bookmarks-bar': true,
      'tab-position': 'top',
      'zoom-level': 100,
      'hardware-acceleration': true,
      'developer-tools': true,
      'auto-updates': true
    };
    
    try {
      await sendSettingsRequest('setMultiple', { settings: defaults });
      return true;
    } catch (error) {
      console.error('[NovaSettings] resetAll failed:', error);
      return false;
    }
  },
  
  // Convenience methods
  getHomepage: async () => {
    try {
      const result = await sendSettingsRequest('get', { key: 'homepage', defaultValue: 'nova://home' });
      return result;
    } catch (error) {
      console.error('[NovaSettings] getHomepage failed:', error);
      return 'nova://home';
    }
  },
  setHomepage: async (url) => {
    try {
      await sendSettingsRequest('set', { key: 'homepage', value: url });
      return true;
    } catch (error) {
      console.error('[NovaSettings] setHomepage failed:', error); 
      return false;
    }
  },
  isDarkMode: async () => {
    try {
      const result = await sendSettingsRequest('get', { key: 'dark-mode', defaultValue: false });
      return result;
    } catch (error) {
      console.error('[NovaSettings] isDarkMode failed:', error);
      return false;
    }
  },
  setDarkMode: async (enabled) => {
    try {
      await sendSettingsRequest('set', { key: 'dark-mode', value: enabled });
      return true;
    } catch (error) {
      console.error('[NovaSettings] setDarkMode failed:', error);
      return false;
    }
  },
  
  // Utility methods
  getStoreType: () => 'ipc-based',
  isInitialized: () => true,
  ready: () => true
});