// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
  console.log('[Nova Renderer] DOM loaded, checking for novaAPI...');
  
  // Check if contextBridge API is available
  if (typeof window.novaAPI === 'undefined') {
    console.error('[Nova Renderer] ❌ novaAPI not available - preload script may have failed');
    return;
  }
  
  console.log('[Nova Renderer] ✅ novaAPI available, initializing browser...');
  
  // Get references to the settings helper (contextBridge version)
  const novaSettings = window.novaAPI.settings;
  console.log('[Nova Renderer] Settings API ready:', window.novaAPI.system.isReady());

  // Setup IPC listener for nova:// URLs from main process
  if (window.novaAPI.ipc) {
    window.novaAPI.ipc.on('open-nova-url', (event, url) => {
      console.log('[Nova Renderer] 🔥 Received nova:// URL:', url);
      const activeWebview = getActiveWebview();
      if (activeWebview) {
        // Extract page name from nova:// URL
        const page = url.replace('nova://', '');
        handleNovaPage(page, activeWebview);
        document.getElementById('url').value = url;
      }
    });
  }

  // Setup IPC listener for settings on webview elements
  const setupWebviewListener = (webview) => {
    console.log('[Nova Renderer] Setting up IPC listener for webview:', webview);
    
    webview.addEventListener('ipc-message', async (event) => {
      console.log('[Nova Renderer] 🔥 Received IPC message on channel:', event.channel, 'args:', event.args);
      
      if (event.channel === 'settings-request') {
        console.log('[Nova Renderer] Processing settings request:', event.args[0]);
        const { requestId, action, ...data } = event.args[0];
        let success = true;
        let result, error;
        try {
          switch (action) {
            case 'get':
              result = await novaSettings.get(data.key, data.defaultValue);
              break;
            case 'set':
              result = await novaSettings.set(data.key, data.value);
              break;
            case 'getAll':
              result = await novaSettings.getAll();
              break;
            case 'setMultiple':
              result = await novaSettings.setMultiple(data.settings);
              break;
            case 'remove':
              result = await novaSettings.remove(data.key);
              break;
            case 'clear':
              result = await novaSettings.clear();
              break;
            case 'reset':
              result = await novaSettings.reset(data.key);
              break;
            case 'resetAll':
              result = await novaSettings.resetAll();
              break;
            case 'has':
              result = await novaSettings.has(data.key);
              break;
            default:
              throw new Error(`Unknown action: ${action}`);
          }
        } catch (err) {
          success = false;
          error = err.message;
        }
        console.log('[Nova Renderer] Sending IPC response:', { requestId, success, data: result, error });
        webview.send('settings-response', { requestId, success, data: result, error });
      }
    });
  };

  // Tab management logic
  const tabsContainer = document.getElementById('tabs');
  const webviewsContainer = document.getElementById('webviews');
  const newTabBtn = document.getElementById('new-tab-btn');
  
  // Toolbar elements
  const backBtn = document.getElementById('back');
  const forwardBtn = document.getElementById('forward');
  const reloadBtn = document.getElementById('reload');
  const devToolsBtn = document.getElementById('devtools');
  const goBtn = document.getElementById('go');
  const urlInput = document.getElementById('url');

  let tabCount = 1; // Start from 1 since tab-0 already exists

  // Get the current active webview
  function getActiveWebview() {
    return document.querySelector('.tab-view.active');
  }

  // Initialize the first tab click handler and add close button
  const firstTab = document.querySelector('.tab[data-id="tab-0"]');
  if (firstTab) {
    // Add close button to the first tab
    addCloseButtonToTab(firstTab, 'tab-0');
    
    firstTab.addEventListener('click', () => {
      activateTab('tab-0');
    });
  }

  // Toolbar button logic
  goBtn.addEventListener('click', async () => {
    const activeWebview = getActiveWebview();
    if (activeWebview) {
      let url = urlInput.value;
      
      // Handle nova:// internal pages
      if (url.startsWith('nova://')) {
        await handleNovaPage(url, activeWebview);
        return;
      }
      
      let regex = /^(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9-]+\.[a-z]{2,})(\/[^\s]*)?$/i; // Regex pattern to match URLs
      if (!regex.test(url)) {
        // If not a URL, treat as a Google search
        url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
      } else {
        if (!url.startsWith('http')) url = 'https://' + url;
      }
      activeWebview.src = url;
    }
  });

  // Allow Enter key in URL input
  urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      goBtn.click();
    }
  });

  backBtn.addEventListener('click', () => {
    const activeWebview = getActiveWebview();
    if (activeWebview && activeWebview.canGoBack()) {
      activeWebview.goBack();
    }
  });

  forwardBtn.addEventListener('click', () => {
    const activeWebview = getActiveWebview();
    if (activeWebview && activeWebview.canGoForward()) {
      activeWebview.goForward();
    }
  });

  reloadBtn.addEventListener('click', () => {
    const activeWebview = getActiveWebview();
    if (activeWebview) {
      // Add loading class for continuous spinning
      reloadBtn.classList.add('loading');
      
      activeWebview.reload();
    }
  });

  // Add keyboard shortcuts for webview dev tools
  document.addEventListener('keydown', (e) => {
    // F12 or Ctrl+Shift+I to open dev tools for active webview
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
      e.preventDefault();
      const activeWebview = getActiveWebview();
      if (activeWebview) {
        console.log('[Nova] Opening dev tools for active webview');
        activeWebview.openDevTools();
      }
    }
    
    // Ctrl+R or F5 to reload active webview
    if ((e.ctrlKey && e.key === 'r') || e.key === 'F5') {
      e.preventDefault();
      const activeWebview = getActiveWebview();
      if (activeWebview) {
        console.log('[Nova] Reloading active webview');
        reloadBtn.classList.add('loading');
        activeWebview.reload();
      }
    }
  });

  // Dev tools button event listener
  devToolsBtn.addEventListener('click', () => {
    const activeWebview = getActiveWebview();
    if (activeWebview) {
      console.log('[Nova] Opening dev tools for active webview via button');
      activeWebview.openDevTools();
    }
  });

  // Handle nova:// internal pages
  async function handleNovaPage(url, webview) {
    let page = url.replace('nova://', '').toLowerCase();
    
    // Remove trailing slash if present
    if (page.endsWith('/')) {
      page = page.slice(0, -1);
    }
    
    // If page is empty after removing slash, default to 'home'
    if (page === '') {
      page = 'home';
    }
    
    // Store the original nova URL on the webview element
    webview.dataset.novaUrl = url;
    
    await loadNovaPage(page, webview);
  }

  // Load nova page from HTML file - automatically finds any page file
  async function loadNovaPage(page, webview) {
    try {
      console.log('[Nova Renderer] 🔧 Loading nova:// page:', page);
      
      const preloadPath = './preload.js'; // Relative path - works because webviews resolve relative to renderer
      console.log('[Nova Renderer] 🔧 Setting up webview for nova:// page:', page);
      console.log('[Nova Renderer] 🔧 Preload path:', preloadPath);
      webview.setAttribute('preload', preloadPath);
      webview.setAttribute('nodeIntegration', '');
      
      // Set up listeners BEFORE loading content
      setupWebviewListener(webview);
      setupWebviewEvents(webview);
      
      // Load directly as nova:// URL instead of data URL to trigger preload script
      const novaUrl = `nova://${page}`;
      console.log('[Nova Renderer] � Loading nova URL directly:', novaUrl);
      
      // Wait for webview to be ready for new content
      return new Promise((resolve, reject) => {
        const loadHandler = () => {
          console.log('[Nova Renderer] ✅ Webview loaded successfully for:', page);
          webview.removeEventListener('dom-ready', loadHandler);
          webview.removeEventListener('did-fail-load', errorHandler);
          resolve();
        };
        
        const errorHandler = (event) => {
          console.error('[Nova Renderer] ❌ Webview failed to load:', page, event);
          webview.removeEventListener('dom-ready', loadHandler);
          webview.removeEventListener('did-fail-load', errorHandler);
          reject(new Error(`Failed to load nova:// page: ${page}`));
        };
        
        webview.addEventListener('dom-ready', loadHandler);
        webview.addEventListener('did-fail-load', errorHandler);
        
        // Load the nova:// URL directly - this will trigger preload script
        webview.loadURL(novaUrl);
      });
    } catch (error) {
      console.error('Error loading nova page:', error);
      // Fallback: try loading with data URL approach
      await loadNovaPageFallback(page, webview);
    }
  }

  // Fallback method using data URLs (without preload script)
  async function loadNovaPageFallback(page, webview) {
    // This fallback is no longer needed since nova:// protocol is handled by main process
    console.warn('[Nova Renderer] Fallback loading should not be needed with nova:// protocol');
    console.warn('[Nova Renderer] If you see this, there may be an issue with the nova:// protocol handler');
    
    // Load 404 page instead
    await load404Page(page, webview);
  }

  // Replace placeholders in HTML content
  function replacePlaceholders(htmlContent, page) {
    return htmlContent
      .replace(/\{\{PAGE\}\}/g, page)
      .replace(/\{\{TIMESTAMP\}\}/g, new Date().toISOString())
      .replace(/\{\{VERSION\}\}/g, '1.0.0');
  }

  // Load 404 page with page name
  async function load404Page(page, webview) {
    // With nova:// protocol, we can just load the 404 page directly
    console.log(`[Nova Renderer] Loading 404 page for: ${page}`);
    webview.src = 'nova://404';
  }

  // Fallback 404 page if file loading fails
  function generateFallback404(page) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error - Nova Browser</title>
        <style>
          body { font-family: sans-serif; text-align: center; padding: 40px; background: #f5f5f5; }
          h1 { color: #e74c3c; }
        </style>
      </head>
      <body>
        <h1>Error</h1>
        <p>Could not load nova://${page}</p>
        <p><a href="nova://home">Go to Nova Home</a></p>
      </body>
      </html>
    `;
  }

  // Generate home page content for new tabs
  function generateHomePage() {
    // With nova:// protocol, we don't need to load files directly
    // The protocol handler in main process will handle nova://home
    return 'nova://home';
  }

  // Helper function to add close button to a tab
  function addCloseButtonToTab(tabButton, tabId) {
    // Check if close button already exists
    if (tabButton.querySelector('.tab-close')) {
      return;
    }

    const closeBtn = document.createElement('span');
    closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    closeBtn.className = 'tab-close';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tabId);
    });
    tabButton.appendChild(closeBtn);
  }

  // Setup webview events
  function setupWebviewEvents(webview) {
    webview.addEventListener('did-start-loading', () => {
      // Only show loading spinner if it was triggered by refresh button
      // The loading class will already be present if refresh was clicked
    });

    webview.addEventListener('did-stop-loading', () => {
      // Remove loading animation when page finishes loading
      if (webview.classList.contains('active')) {
        reloadBtn.classList.remove('loading');
        
        // Update URL bar with nova URL if it's a nova page
        if (webview.dataset.novaUrl) {
          urlInput.value = webview.dataset.novaUrl;
        }
      }
    });

    webview.addEventListener('did-navigate', (event) => {
      if (webview.classList.contains('active')) {
        // Check if this is a nova page
        if (webview.dataset.novaUrl) {
          urlInput.value = webview.dataset.novaUrl;
        } else {
          urlInput.value = event.url;
        }
      }
    });

    webview.addEventListener('did-navigate-in-page', (event) => {
      if (webview.classList.contains('active')) {
        // Check if this is a nova page
        if (webview.dataset.novaUrl) {
          urlInput.value = webview.dataset.novaUrl;
        } else {
          urlInput.value = event.url;
        }
      }
    });

    // Add context menu for webview dev tools
    webview.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      
      // Create context menu
      const contextMenu = document.createElement('div');
      contextMenu.className = 'webview-context-menu';
      contextMenu.style.cssText = `
        position: fixed;
        top: ${event.clientY}px;
        left: ${event.clientX}px;
        background: white;
        border: 1px solid #ccc;
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 10000;
        padding: 5px 0;
        min-width: 150px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
      `;
      
      // Add menu items
      const devToolsItem = document.createElement('div');
      devToolsItem.textContent = 'Inspect Element';
      devToolsItem.style.cssText = `
        padding: 8px 16px;
        cursor: pointer;
        border-bottom: 1px solid #eee;
      `;
      devToolsItem.addEventListener('mouseenter', () => {
        devToolsItem.style.background = '#f0f0f0';
      });
      devToolsItem.addEventListener('mouseleave', () => {
        devToolsItem.style.background = 'white';
      });
      devToolsItem.addEventListener('click', () => {
        webview.openDevTools();
        document.body.removeChild(contextMenu);
      });
      
      const reloadItem = document.createElement('div');
      reloadItem.textContent = 'Reload Page';
      reloadItem.style.cssText = `
        padding: 8px 16px;
        cursor: pointer;
      `;
      reloadItem.addEventListener('mouseenter', () => {
        reloadItem.style.background = '#f0f0f0';
      });
      reloadItem.addEventListener('mouseleave', () => {
        reloadItem.style.background = 'white';
      });
      reloadItem.addEventListener('click', () => {
        webview.reload();
        document.body.removeChild(contextMenu);
      });
      
      contextMenu.appendChild(devToolsItem);
      contextMenu.appendChild(reloadItem);
      document.body.appendChild(contextMenu);
      
      // Remove context menu when clicking elsewhere
      const removeMenu = (e) => {
        if (!contextMenu.contains(e.target)) {
          document.body.removeChild(contextMenu);
          document.removeEventListener('click', removeMenu);
        }
      };
      setTimeout(() => document.addEventListener('click', removeMenu), 0);
    });

    webview.addEventListener('page-title-updated', (event) => {
      const tabId = webview.dataset.id;
      const tabButton = document.querySelector(`.tab[data-id="${tabId}"]`);
      if (tabButton) {
        // Find and preserve the close button
        const closeBtn = tabButton.querySelector('.tab-close');
        
        // Update the text content while preserving the close button
        const title = event.title || 'New Tab';
        
        if (closeBtn) {
          // Remove close button temporarily, update text, then re-add it
          closeBtn.remove();
          tabButton.innerText = title;
          tabButton.appendChild(closeBtn);
        } else {
          // If no close button exists, just update the text
          tabButton.innerText = title;
        }
      }
    });

    // Handle messages from nova pages
    webview.addEventListener('ipc-message', async (event) => {
      console.log('[Nova Renderer] Received IPC message:', event.channel, event.args);
      
      if (event.channel === 'navigate') {
        const url = event.args[0];
        if (url.startsWith('nova://')) {
          await handleNovaPage(url, webview);
        } else {
          // Clear nova URL data when navigating to external sites
          delete webview.dataset.novaUrl;
          webview.src = url;
        }
        // Update URL bar
        if (webview.classList.contains('active')) {
          urlInput.value = url;
        }
      } else if (event.channel === 'nova-settings-request') {
        // Handle settings requests from nova pages
        const { action, data, id } = event.args[0];
        
        try {
          let result;
          switch (action) {
            case 'get':
              result = await novaSettingsHelper.get(data.key, data.defaultValue);
              break;
            case 'set':
              result = await novaSettingsHelper.set(data.key, data.value);
              break;
            case 'getAll':
              result = await novaSettingsHelper.getAll();
              break;
            case 'setMultiple':
              result = await novaSettingsHelper.setMultiple(data.settings);
              break;
            case 'remove':
              result = await novaSettingsHelper.remove(data.key);
              break;
            case 'clear':
              result = await novaSettingsHelper.clear();
              break;
            case 'reset':
              result = await novaSettingsHelper.reset(data.key);
              break;
            case 'resetAll':
              result = await novaSettingsHelper.resetAll();
              break;
            case 'has':
              result = await novaSettingsHelper.has(data.key);
              break;
            default:
              throw new Error(`Unknown settings action: ${action}`);
          }
          
          // Send response back to webview
          webview.send('nova-settings-response', {
            id,
            success: true,
            data: result
          });
          
        } catch (error) {
          console.error('[Nova Renderer] Settings request failed:', error);
          webview.send('nova-settings-response', {
            id,
            success: false,
            error: error.message
          });
        }
      }
    });
  }

  // Setup events for the initial webview
  const initialWebview = document.querySelector('.tab-view[data-id="tab-0"]');
  if (initialWebview) {
    // Set correct preload path for initial webview BEFORE setting src
    const preloadPath = './preload.js'; // Relative path works for webviews
    console.log('[Nova Renderer] Setting preload path for initial webview:', preloadPath);
    initialWebview.setAttribute('preload', preloadPath);
    
    // Now set the src after preload is configured
    initialWebview.src = 'nova://home';
    
    setupWebviewListener(initialWebview);
    setupWebviewEvents(initialWebview);
    // Set initial URL in the input
    urlInput.value = 'nova://home';
  }

  // New tab creation
  newTabBtn.addEventListener('click', () => {
    const tabId = `tab-${tabCount++}`;

    // Create tab button
    const tabButton = document.createElement('button');
    tabButton.className = 'tab';
    tabButton.innerText = 'New Tab';
    tabButton.dataset.id = tabId;

    // Create webview
    const webview = document.createElement('webview');
    webview.src = generateHomePage(); // This now returns 'nova://home'
    webview.className = 'tab-view';
    webview.dataset.id = tabId;
    const preloadPath = './preload.js'; // Relative path works for webviews
    console.log('[Nova Renderer] Setting preload path for new webview:', preloadPath);
    webview.setAttribute('preload', preloadPath);

    // Setup events for the new webview
    setupWebviewListener(webview);
    setupWebviewEvents(webview);

    // Add click handler for the tab
    tabButton.addEventListener('click', () => {
      activateTab(tabId);
    });

    // Add close button to tab
    addCloseButtonToTab(tabButton, tabId);

    // Add to DOM
    tabsContainer.insertBefore(tabButton, newTabBtn);
    webviewsContainer.appendChild(webview);

    // Activate the new tab
    activateTab(tabId);
  });

  function activateTab(tabId) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.id === tabId);
    });

    // Update webviews
    document.querySelectorAll('.tab-view').forEach(view => {
      view.classList.toggle('active', view.dataset.id === tabId);
    });

    // Update URL input with current webview URL
    const activeWebview = getActiveWebview();
    if (activeWebview) {
      // Check if this is a nova page first
      if (activeWebview.dataset.novaUrl) {
        urlInput.value = activeWebview.dataset.novaUrl;
      } else {
        urlInput.value = activeWebview.src;
      }
    }
  }

  function closeTab(tabId) {
    const allTabs = document.querySelectorAll('.tab[data-id]');
    
    // If the last tab is closed, close the browser
    if (allTabs.length <= 1) {
      ipcRenderer.send('close-window');
      return;
    }

    const tabButton = document.querySelector(`.tab[data-id="${tabId}"]`);
    const webview = document.querySelector(`.tab-view[data-id="${tabId}"]`);
    
    if (tabButton && webview) {
      const wasActive = tabButton.classList.contains('active');
      
      // Remove elements
      tabButton.remove();
      webview.remove();
      
      // If we closed the active tab, activate another one
      if (wasActive) {
        const remainingTabs = document.querySelectorAll('.tab[data-id]');
        if (remainingTabs.length > 0) {
          const newActiveTab = remainingTabs[remainingTabs.length - 1];
          activateTab(newActiveTab.dataset.id);
        }
      }
    }
  }

  // Initialize theme system
  initializeThemeSystem();
});

// Theme system initialization
function initializeThemeSystem() {
  console.log('[Nova Renderer] Initializing theme system...');
  
  // Load theme from settings and apply to main window
  loadThemeFromSettings();
  
  // Listen for theme changes from Nova pages
  window.addEventListener('storage', (e) => {
    if (e.key === 'nova-theme') {
      applyThemeToMainWindow(e.newValue);
    }
  });
  
  // Listen for theme changes from webviews via postMessage
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'nova-theme-changed') {
      applyThemeToMainWindow(event.data.theme);
      localStorage.setItem('nova-theme', event.data.theme);
    }
  });
}

async function loadThemeFromSettings() {
  try {
    const novaSettings = window.novaAPI?.settings;
    if (novaSettings) {
      const darkMode = await novaSettings.get('dark-mode', false);
      const theme = darkMode ? 'dark' : 'light';
      applyThemeToMainWindow(theme);
      localStorage.setItem('nova-theme', theme);
      console.log('[Nova Renderer] Theme loaded from settings:', theme);
    }
  } catch (error) {
    console.error('[Nova Renderer] Failed to load theme from settings:', error);
    // Fallback to localStorage
    const savedTheme = localStorage.getItem('nova-theme') || 'dark';
    applyThemeToMainWindow(savedTheme);
  }
}

function applyThemeToMainWindow(theme) {
  const html = document.documentElement;
  
  if (theme === 'dark') {
    html.setAttribute('data-theme', 'dark');
  } else {
    html.setAttribute('data-theme', 'light');
  }
  
  console.log('[Nova Renderer] Applied theme to main window:', theme);
}
