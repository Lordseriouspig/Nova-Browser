const { contextBridge, ipcRenderer } = require('electron');

console.log('🚀 [Preload] Nova preload script starting with contextBridge...');
console.log('🚀 [Preload] Running in:', window === window.parent ? 'Main Window' : 'Webview/Frame');
console.log('🚀 [Preload] Current URL:', window.location?.href || 'unknown');

// Track pending requests
const pendingRequests = new Map();

// Handle responses from webview.send() (when sent from renderer via webview.send)
if (window !== window.parent) {
  // In webview context, listen for messages sent via webview.send()
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
}

// Helper function to send settings requests via IPC
function sendSettingsRequest(action, data = {}) {
  return new Promise((resolve, reject) => {
    const requestId = Math.random().toString(36).substr(2, 9);
    const channel = 'settings-request';
    
    // Check if we're in a webview or main window
    const isWebview = window !== window.parent;
    
    // Store the promise handlers
    pendingRequests.set(requestId, { resolve, reject });
    
    // Send the request
    const request = {
      requestId,
      action,
      ...data
    };
    
    try {
      if (isWebview) {
        // In webview, send to host (renderer process)
        ipcRenderer.sendToHost(channel, request);
      } else {
        // In main window, send to main process
        ipcRenderer.send(channel, request);
        
        // For main window, set up a one-time listener
        const responseHandler = (event, response) => {
          if (response.requestId === requestId) {
            ipcRenderer.removeListener('settings-response', responseHandler);
            if (pendingRequests.has(requestId)) {
              const { resolve, reject } = pendingRequests.get(requestId);
              pendingRequests.delete(requestId);
              
              if (response.success) {
                resolve(response.data);
              } else {
                reject(new Error(response.error || 'Settings request failed'));
              }
            }
          }
        };
        
        ipcRenderer.on('settings-response', responseHandler);
      }
    } catch (error) {
      console.error('[Preload] Failed to send settings request:', error);
      pendingRequests.delete(requestId);
      reject(error);
    }
    
    // Timeout after 5 seconds
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error(`Settings request timeout for ${action} (requestId: ${requestId})`));
      }
    }, 5000);
  });
}

// Expose secure API to renderer via contextBridge
contextBridge.exposeInMainWorld('novaAPI', {
  // Settings API - via IPC communication
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
        console.log(`[NovaAPI] Settings set: ${key} = ${value}`);
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
        console.log(`[NovaAPI] Settings setMultiple: ${Object.keys(settings).length} settings`);
        return true;
      } catch (error) {
        console.error('[NovaAPI] Settings setMultiple failed:', error);
        return false;
      }
    },
    
    remove: async (key) => {
      try {
        await sendSettingsRequest('remove', { key });
        console.log(`[NovaAPI] Settings remove: ${key}`);
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
        console.log('[NovaAPI] Settings cleared');
        return true;
      } catch (error) {
        console.error('[NovaAPI] Settings clear failed:', error);
        return false;
      }
    },
    
    // Convenience methods
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
  
  // IPC API for renderer communication
  ipc: {
    send: (channel, ...args) => {
      // Whitelist allowed channels for security
      const validChannels = ['close-window', 'open-nova-url'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, ...args);
      }
    },
    
    on: (channel, callback) => {
      const validChannels = ['open-nova-url'];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, callback);
      }
    },
    
    removeAllListeners: (channel) => {
      const validChannels = ['open-nova-url'];
      if (validChannels.includes(channel)) {
        ipcRenderer.removeAllListeners(channel);
      }
    }
  },
  
  // System info
  system: {
    getStoreType: () => 'ipc-based',
    isReady: () => true
  }
});


// Also expose a simplified settings helper
contextBridge.exposeInMainWorld('novaSettings', {
  // Core API methods - via IPC communication
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
      console.log(`[NovaSettings] set: ${key} = ${value}`);
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
      console.log(`[NovaSettings] setMultiple: ${Object.keys(settings).length} settings`);
      return true;
    } catch (error) {
      console.error('[NovaSettings] setMultiple failed:', error);
      return false;
    }
  },
  
  clear: async () => {
    try {
      await sendSettingsRequest('clear');
      console.log('[NovaSettings] cleared');
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
      console.log(`[NovaSettings] remove: ${key}`);
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

console.log('🚀 [Preload] Nova API exposed via contextBridge');
console.log('🚀 [Preload] NovaSettings exposed via contextBridge');
console.log('🚀 [Preload] Settings communication: IPC-based');
console.log('🚀 [Preload] Context:', window === window.parent ? 'Main Window' : 'Webview/Frame');
console.log('🚀 [Preload] Current URL:', window.location.href);
console.log('🚀 [Preload] If you see these 🚀 messages, the preload script is working!');