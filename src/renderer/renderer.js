// Initialize Sentry for renderer process error tracking
let Sentry = null;
try {
  Sentry = require("@sentry/electron/renderer");
  Sentry.init({
    dsn: "https://ebf0e69b9cea5c343f5b90005b9f214c@o4509766495043584.ingest.de.sentry.io/4509766498713680",
    environment: process.env.NODE_ENV || 'development',
  });
  console.log('[Nova Renderer] Sentry initialized successfully');
} catch (error) {
  console.warn('[Nova Renderer] Sentry initialization failed:', error.message);
  // Create a mock Sentry object to prevent errors
  Sentry = {
    captureException: (error) => console.error('[Nova Renderer] Error (Sentry disabled):', error),
    captureMessage: (message, level) => console.log(`[Nova Renderer] Message (Sentry disabled):`, message)
  };
}

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
  
  // Check if contextBridge API is available
  if (typeof window.novaAPI === 'undefined') {
    console.error('[Nova Renderer] novaAPI not available - preload script may have failed');
    return;
  }
  
  // Get references to the settings helper (contextBridge version)
  const novaSettings = window.novaAPI.settings;

  // Setup IPC listener for nova:// URLs
  if (window.novaAPI.ipc) {
    window.novaAPI.ipc.on('open-nova-url', (event, url) => {
      const activeWebview = getActiveWebview();
      if (activeWebview) {
        const page = url.replace('nova://', '');
        handleNovaPage(page, activeWebview);
        document.getElementById('url').value = url;
      }
    });
    
    // Setup IPC listener for refreshing bookmarks bar
    window.novaAPI.ipc.on('refresh-bookmarks-bar', async () => {
      console.debug('[Nova Renderer] Received refresh-bookmarks-bar request');
      if (typeof loadBookmarksBar === 'function') {
        try {
          await loadBookmarksBar();
          console.debug('[Nova Renderer] Bookmarks bar refreshed successfully');
        } catch (error) {
          console.error('[Nova Renderer] Failed to refresh bookmarks bar:', error);
        }
      } else {
        console.warn('[Nova Renderer] loadBookmarksBar function not available');
      }
    });

    // Setup IPC listeners for download updates
    window.novaAPI.ipc.on('download-started', (event, downloadItem) => {
      console.log('[Nova Renderer] Download started:', downloadItem);
      updateDownloadBadge();
      createDownloadNotification(downloadItem);
    });
    
    window.novaAPI.ipc.on('download-updated', (event, downloadItem) => {
      console.log('[Nova Renderer] Download updated:', downloadItem);
      updateDownloadBadge();
      updateDownloadNotification(downloadItem);
    });
    
    window.novaAPI.ipc.on('download-completed', (event, downloadItem) => {
      console.log('[Nova Renderer] Download completed:', downloadItem);
      updateDownloadBadge();
      updateDownloadNotification(downloadItem);
    });
  }

  // Setup IPC listener for settings
  const setupWebviewListener = (webview) => {
    
    webview.addEventListener('ipc-message', async (event) => {  
      if (event.channel === 'settings-request') {
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
  const bookmarkBtn = document.getElementById('bookmark-btn');
  const downloadsBtn = document.getElementById('downloads-btn');
  const bookmarksBar = document.getElementById('bookmarks-bar');

  let tabCount = 1;

  // Get the current active webview
  function getActiveWebview() {
    return document.querySelector('.tab-view.active');
  }

  // Update URL input from webview's current URL
  function updateUrlFromWebview(webview) {
    if (webview && webview.classList.contains('active')) {
      if (webview.dataset.novaUrl) {
        urlInput.value = webview.dataset.novaUrl;
      } else {
        try {
          const currentUrl = webview.getURL();
          urlInput.value = currentUrl;
        } catch (error) {
          console.info('Could not get webview URL:', error);
        }
      }
    }
  }

  // Initialize the first tab click handler and add close button
  const firstTab = document.querySelector('.tab[data-id="tab-0"]');
  if (firstTab) {
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
      if (url.startsWith('nova://')) {
        await handleNovaPage(url, activeWebview);
        return;
      }
      
      let regex = /^(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9-]+\.[a-z]{2,})(\/[^\s]*)?$/i; // Regex pattern to match URLs
      if (!regex.test(url)) {
        // If not a URL, treat as a search query using the default search engine
        try {
          let searchEngine = 'Google';
          if (novaSettings) {
            searchEngine = await novaSettings.get('search-engine', 'Google');
          }
          
          // Build search URL based on engine
          switch (searchEngine) {
            case 'Bing':
              url = 'https://www.bing.com/search?q=' + encodeURIComponent(url);
              break;
            case 'DuckDuckGo':
              url = 'https://duckduckgo.com/?q=' + encodeURIComponent(url);
              break;
            case 'Yahoo':
              url = 'https://search.yahoo.com/search?p=' + encodeURIComponent(url);
              break;
            case 'Google':
            default:
              url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
              break;
          }
        } catch (error) {
          console.warn('Could not get search engine setting, using Google:', error);
          url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
        }
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

      setTimeout(() => {
        updateUrlFromWebview(activeWebview);
      }, 100);
    }
  });

  forwardBtn.addEventListener('click', () => {
    const activeWebview = getActiveWebview();
    if (activeWebview && activeWebview.canGoForward()) {
      activeWebview.goForward();
      
      setTimeout(() => {
        updateUrlFromWebview(activeWebview);
      }, 100);
    }
  });

  reloadBtn.addEventListener('click', () => {
    const activeWebview = getActiveWebview();
    if (activeWebview) {
      reloadBtn.classList.add('loading');
      
      activeWebview.reload();
    }
  });

  // Bookmark button functionality
  bookmarkBtn.addEventListener('click', async () => {
    const activeWebview = getActiveWebview();
    if (activeWebview) {
      const currentUrl = urlInput.value;
      const title = await getPageTitle(activeWebview);
      await addBookmark(currentUrl, title);
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
      e.preventDefault();
      const activeWebview = getActiveWebview();
      if (activeWebview) {
        console.debug('[Nova] Opening dev tools for active webview');
        activeWebview.openDevTools();
      }
    }
    
    if ((e.ctrlKey && e.key === 'r') || e.key === 'F5') {
      e.preventDefault();
      const activeWebview = getActiveWebview();
      if (activeWebview) {
        console.debug('[Nova] Reloading active webview');
        reloadBtn.classList.add('loading');
        activeWebview.reload();
      }
    }
  });

  // Dev tools button event listener
  devToolsBtn.addEventListener('click', () => {
    const activeWebview = getActiveWebview();
    if (activeWebview) {
      activeWebview.openDevTools();
    }
  });

  // Downloads button event listener
  downloadsBtn.addEventListener('click', async () => {
    console.log('[Nova Renderer] Toolbar downloads button clicked');
    const activeWebview = getActiveWebview();
    if (activeWebview) {
      console.log('[Nova Renderer] Toolbar calling handleNovaPage');
      await handleNovaPage('nova://downloads', activeWebview);
      updateUrlFromWebview(activeWebview);
    }
  });

  // Navigation function for nova pages
  window.navigateFromNova = (url) => {
    const activeWebview = getActiveWebview();
    if (activeWebview) {
      if (url.startsWith('nova://')) {
        handleNovaPage(url, activeWebview);
        activeWebview.dataset.novaUrl = url;
      } else {
        delete activeWebview.dataset.novaUrl;
        activeWebview.src = url;
      }
      document.getElementById('url').value = url;
    }
  };

  // Handle nova:// internal pages
  async function handleNovaPage(url, webview) {
    let page = url.replace('nova://', '').toLowerCase();
    
    // Remove trailing slash if present
    if (page.endsWith('/')) {
      page = page.slice(0, -1);
    }
    
    if (page === '') {
      page = 'home';
    }
    
    webview.dataset.novaUrl = url;
    
    await loadNovaPage(page, webview);
  }

  async function loadNovaPage(page, webview) {
    try {
      const preloadPath = './preload.js';
      webview.setAttribute('preload', preloadPath);
      
      setupWebviewListener(webview);
      setupWebviewEvents(webview);

      const novaUrl = `nova://${page}`;
      
      return new Promise((resolve, reject) => {
        const loadHandler = () => {
          webview.removeEventListener('dom-ready', loadHandler);
          webview.removeEventListener('did-fail-load', errorHandler);
          resolve();
        };
        
        const errorHandler = (event) => {
          console.error('[Nova Renderer] Webview failed to load:', page, event);
          webview.removeEventListener('dom-ready', loadHandler);
          webview.removeEventListener('did-fail-load', errorHandler);
          reject(new Error(`Failed to load nova:// page: ${page}`));
        };
        
        webview.addEventListener('dom-ready', loadHandler);
        webview.addEventListener('did-fail-load', errorHandler);
        
        webview.loadURL(novaUrl);
      });
    } catch (error) {
      console.error('Error loading nova page:', error);
      await load404Page(page, webview);;
    }
  }

  // Load 404 page with page name
  async function load404Page(page, webview) {
    // Redirect to error page with nova-404 code
    console.debug(`[Nova Renderer] Loading nova-404 error page for: ${page}`);
    const errorPageUrl = `nova://error?code=nova-404&url=${encodeURIComponent('nova://' + page)}&message=Page not found`;
    
    // Set nova URL to maintain proper navigation
    webview.dataset.novaUrl = errorPageUrl;
    
    // Handle the error page
    handleNovaPage(errorPageUrl, webview);
  }

  // Generate home page content for new tabs
  async function generateHomePage() {
    try {
      if (window.novaSettings) {
        const homepage = await window.novaSettings.get('homepage', 'nova://home');
        return homepage;
      }
    } catch (error) {
      console.info('Could not get homepage from settings, using default:', error);
    }
    
    return 'nova://home';
  }

  // Helper function to add close button to a tab
  function addCloseButtonToTab(tabButton, tabId) {
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
    });

    webview.addEventListener('did-stop-loading', () => {
      if (webview.classList.contains('active')) {
        reloadBtn.classList.remove('loading');
        
        if (webview.dataset.novaUrl) {
          urlInput.value = webview.dataset.novaUrl;
        }
      }
    });

    webview.addEventListener('did-navigate', (event) => {
      if (webview.classList.contains('active')) {
        if (webview.dataset.novaUrl) {
          urlInput.value = webview.dataset.novaUrl;
        } else {
          urlInput.value = event.url;
        }
        // Update bookmark button state for new URL
        updateBookmarkButtonState(event.url);
        
        // Add to history
        addToHistory(event.url, webview);
      }
    });

    webview.addEventListener('did-navigate-in-page', (event) => {
      if (webview.classList.contains('active')) {
        if (webview.dataset.novaUrl) {
          urlInput.value = webview.dataset.novaUrl;
        } else {
          urlInput.value = event.url;
        }
        // Update bookmark button state for new URL
        updateBookmarkButtonState(event.url);
        
        // Add to history
        addToHistory(event.url, webview);
      }
    });

    // Add context menu for webview dev tools
    webview.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      
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
        const closeBtn = tabButton.querySelector('.tab-close');
        const faviconImg = tabButton.querySelector('.tab-favicon');
        
        const title = event.title || 'New Tab';
        
        if (closeBtn) {
          closeBtn.remove();
          tabButton.innerHTML = '';
          if (faviconImg) {
            tabButton.appendChild(faviconImg);
          }
          const titleSpan = document.createElement('span');
          titleSpan.className = 'tab-title';
          titleSpan.textContent = title;
          tabButton.appendChild(titleSpan);
          tabButton.appendChild(closeBtn);
        } else {
          tabButton.innerHTML = '';
          if (faviconImg) {
            tabButton.appendChild(faviconImg);
          }
          const titleSpan = document.createElement('span');
          titleSpan.className = 'tab-title';
          titleSpan.textContent = title;
          tabButton.appendChild(titleSpan);
        }
      }
    });

    webview.addEventListener('page-favicon-updated', async (event) => {
      const tabId = webview.dataset.id;
      const tabButton = document.querySelector(`.tab[data-id="${tabId}"]`);
      if (tabButton) {
        let faviconImg = tabButton.querySelector('.tab-favicon');
        
        if (!faviconImg) {
          faviconImg = document.createElement('img');
          faviconImg.className = 'tab-favicon';
          faviconImg.width = 16;
          faviconImg.height = 16;
        }
        
        if (event.favicons && event.favicons.length > 0) {
          // Use the first favicon URL
          faviconImg.src = event.favicons[0];
          faviconImg.onerror = () => {
            // Fallback to Google's favicon service
            const url = webview.src || webview.dataset.novaUrl;
            if (url && !url.startsWith('nova://')) {
              try {
                const domain = new URL(url).hostname;
                faviconImg.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
              } catch (e) {
                // If URL parsing fails, use default
                faviconImg.src = getDefaultFaviconDataURI();
              }
            } else {
              faviconImg.src = getDefaultFaviconDataURI();
            }
          };
        } else {
          // No favicon provided, try Google's service or use default
          const url = webview.src || webview.dataset.novaUrl;
          if (url && !url.startsWith('nova://')) {
            try {
              const domain = new URL(url).hostname;
              faviconImg.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
              faviconImg.onerror = () => {
                faviconImg.src = getDefaultFaviconDataURI();
              };
            } catch (e) {
              faviconImg.src = getDefaultFaviconDataURI();
            }
          } else if (url && url.startsWith('nova://')) {
            // For nova pages, get the proper favicon
            getFavicon(url).then(favicon => {
              faviconImg.src = favicon;
            }).catch(() => {
              faviconImg.src = getDefaultFaviconDataURI();
            });
          } else {
            faviconImg.src = getDefaultFaviconDataURI();
          }
        }
        
        // Update tab structure with favicon
        const closeBtn = tabButton.querySelector('.tab-close');
        const titleSpan = tabButton.querySelector('.tab-title');
        
        if (titleSpan && !tabButton.querySelector('.tab-favicon')) {
          tabButton.insertBefore(faviconImg, titleSpan);
        }
      }
    });

    // Handle messages from nova pages
    webview.addEventListener('ipc-message', async (event) => {
      
      if (event.channel === 'navigate') {
        const url = event.args[0];
        if (url.startsWith('nova://')) {
          await handleNovaPage(url, webview);
        } else {
          delete webview.dataset.novaUrl;
          webview.src = url;
        }
        if (webview.classList.contains('active')) {
          urlInput.value = url;
        }
      } else if (event.channel === 'nova-settings-request') {
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

    // Handle webview loading failures and network errors
    webview.addEventListener('did-fail-load', (event) => {
      if (event.isMainFrame && event.errorCode !== 0) {
        const originalUrl = event.validatedURL || webview.getURL();
        const errorCode = event.errorCode;
        
        console.debug(`[Nova Renderer] Thrown error for page: ${originalUrl} (Error code: ${errorCode}, ${event.errorDescription})`);
        const errorPageUrl = `nova://error?code=${errorCode}&url=${encodeURIComponent(originalUrl)}&message=${encodeURIComponent(event.errorDescription || 'Unknown error')}`;
        
        webview.dataset.novaUrl = errorPageUrl;
        
        handleNovaPage(errorPageUrl, webview);
        
        if (webview.classList.contains('active')) {
          urlInput.value = originalUrl;
        }
      }
    });
  }

  // History tracking function
  async function addToHistory(url, webview) {
    try {
      // Don't track certain URLs
      if (url === 'about:blank' || 
          url.startsWith('file://') || 
          url.startsWith('chrome://') ||
          url.startsWith('chrome-extension://') ||
          url.startsWith('devtools://')) {
        return;
      }

      // Get page title
      let title = url;
      try {
        title = await webview.executeJavaScript('document.title') || url;
      } catch (error) {
        // Use URL if can't get title
        title = url;
      }

      // Get current history
      const history = await novaSettings.get('browsing-history', []);
      
      // Remove existing entry for this URL to avoid duplicates
      const filteredHistory = history.filter(item => item.url !== url);
      
      // Add new entry at the beginning
      const historyItem = {
        id: Date.now().toString(),
        url: url,
        title: title,
        favicon: await getFavicon(url),
        timestamp: new Date().toISOString(),
        visitCount: 1
      };

      filteredHistory.unshift(historyItem);

      // Limit history to 1000 items
      const limitedHistory = filteredHistory.slice(0, 1000);

      // Save to settings
      await novaSettings.set('browsing-history', limitedHistory);
      
      console.debug('[Nova] Added to history:', title, url);
    } catch (error) {
      console.warn('[Nova] Failed to add to history:', error);
    }
  }

  // Get favicon emoji for URL
  function getFaviconForUrl(url) {
    if (url.includes('google.com')) return '🔍';
    if (url.includes('github.com')) return '🐙';
    if (url.includes('youtube.com')) return '📺';
    if (url.includes('wikipedia.org')) return '📖';
    if (url.includes('stackoverflow.com')) return '💬';
    if (url.includes('reddit.com')) return '🟠';
    if (url.includes('twitter.com') || url.includes('x.com')) return '🐦';
    if (url.includes('facebook.com')) return '📘';
    if (url.includes('instagram.com')) return '📷';
    if (url.includes('linkedin.com')) return '💼';
    if (url.includes('amazon.com')) return '📦';
    if (url.includes('netflix.com')) return '🎬';
    if (url.includes('spotify.com')) return '🎵';
    if (url.includes('nova://home')) return '🌟';
    if (url.startsWith('nova://')) return '⚙️';
    return '🌐';
  }

  // Setup events for the initial webview - use async initialization
  async function initializeFirstTab() {
    const initialWebview = document.querySelector('.tab-view[data-id="tab-0"]');
    const initialTab = document.querySelector('.tab[data-id="tab-0"]');
    
    if (initialWebview && initialTab) {
      const preloadPath = './preload.js';
      initialWebview.setAttribute('preload', preloadPath);
      
      const homepageUrl = await generateHomePage();
      initialWebview.src = homepageUrl;
      
      setupWebviewListener(initialWebview);
      setupWebviewEvents(initialWebview);
      urlInput.value = homepageUrl;
      
      // Set default favicon for nova:// home page
      const faviconImg = initialTab.querySelector('.tab-favicon');
      if (faviconImg && homepageUrl.startsWith('nova://')) {
        getFavicon(homepageUrl).then(favicon => {
          faviconImg.src = favicon;
        }).catch(() => {
          faviconImg.src = getDefaultFaviconDataURI();
        });
      }
    }
  }

  // Initialize the first tab
  initializeFirstTab();

  // New tab creation
  newTabBtn.addEventListener('click', async () => {
    const tabId = `tab-${tabCount++}`;

    const tabButton = document.createElement('button');
    tabButton.className = 'tab';
    tabButton.dataset.id = tabId;
    
    // Create favicon element
    const faviconImg = document.createElement('img');
    faviconImg.className = 'tab-favicon';
    faviconImg.width = 16;
    faviconImg.height = 16;
    faviconImg.src = getDefaultFaviconDataURI();
    
    // Create title span
    const titleSpan = document.createElement('span');
    titleSpan.className = 'tab-title';
    titleSpan.textContent = 'New Tab';
    
    tabButton.appendChild(faviconImg);
    tabButton.appendChild(titleSpan);

    const webview = document.createElement('webview');
    webview.src = await generateHomePage();
    webview.className = 'tab-view';
    webview.dataset.id = tabId;
    const preloadPath = './preload.js';
    webview.setAttribute('preload', preloadPath);

    setupWebviewListener(webview);
    setupWebviewEvents(webview);

    tabButton.addEventListener('click', () => {
      activateTab(tabId);
    });

    addCloseButtonToTab(tabButton, tabId);

    tabsContainer.insertBefore(tabButton, newTabBtn);
    webviewsContainer.appendChild(webview);
    activateTab(tabId);
  });

  function activateTab(tabId) {
    document.querySelectorAll('.tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.id === tabId);
    });

    document.querySelectorAll('.tab-view').forEach(view => {
      view.classList.toggle('active', view.dataset.id === tabId);
    });

    const activeWebview = getActiveWebview();
    if (activeWebview) {
      let currentUrl;
      if (activeWebview.dataset.novaUrl) {
        currentUrl = activeWebview.dataset.novaUrl;
        urlInput.value = currentUrl;
      } else {
        currentUrl = activeWebview.src;
        urlInput.value = currentUrl;
      }
      // Update bookmark button state for the active tab
      updateBookmarkButtonState(currentUrl);
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
      
      tabButton.remove();
      webview.remove();
      
      if (wasActive) {
        const remainingTabs = document.querySelectorAll('.tab[data-id]');
        if (remainingTabs.length > 0) {
          const newActiveTab = remainingTabs[remainingTabs.length - 1];
          activateTab(newActiveTab.dataset.id);
        }
      }
    }
  }

  // Make functions available globally for bookmarks page
  window.createBookmarkFolder = createBookmarkFolder;
  window.getBookmarkFolders = getBookmarkFolders;
  window.getBookmarksInFolder = getBookmarksInFolder;
  window.moveBookmarkToFolder = moveBookmarkToFolder;

  // Theme and bookmarks systems
  initializeThemeSystem();
  initializeBookmarksSystem();
  updateBookmarksBarVisibility();

  // Bookmark management functions
  async function getPageTitle(webview) {
    try {
      return await webview.executeJavaScript('document.title') || 'Untitled';
    } catch (error) {
      console.warn('Could not get page title:', error);
      return 'Untitled';
    }
  }

  async function addBookmark(url, title) {
    try {
      const bookmarks = await novaSettings.get('bookmarks', []);
      
      // Check if bookmark already exists
      const existingIndex = bookmarks.findIndex(bookmark => bookmark.url === url);
      if (existingIndex !== -1) {
        // Remove existing bookmark
        bookmarks.splice(existingIndex, 1);
        await novaSettings.set('bookmarks', bookmarks);
        
        // Refresh bookmarks bar
        await loadBookmarksBar();
        
        // Visual feedback for removal
        bookmarkBtn.style.color = '#ff6b6b';
        bookmarkBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>';
        setTimeout(() => {
          bookmarkBtn.style.color = '';
          updateBookmarkButtonState(url);
        }, 1000);
        
        console.debug('Bookmark removed:', url);
        return;
      }
      
      // Add new bookmark
      const newBookmark = {
        id: Date.now().toString(),
        url: url,
        title: title,
        favicon: await getFavicon(url),
        dateAdded: new Date().toISOString(),
        folderId: null // Default to no folder
      };
      
      bookmarks.push(newBookmark);
      await novaSettings.set('bookmarks', bookmarks);
      
      // Refresh bookmarks bar
      await loadBookmarksBar();
      
      // Visual feedback for addition
      bookmarkBtn.style.color = '#ffd700';
      bookmarkBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>';
      setTimeout(() => {
        bookmarkBtn.style.color = '';
        updateBookmarkButtonState(url);
      }, 1000);
      
      console.debug('Bookmark added:', newBookmark);
    } catch (error) {
      console.error('Failed to add/remove bookmark:', error);
      alert('Failed to update bookmark');
    }
  }

  // Update bookmark button appearance based on whether page is bookmarked
  async function updateBookmarkButtonState(url) {
    try {
      const bookmarks = await novaSettings.get('bookmarks', []);
      const isBookmarked = bookmarks.some(bookmark => bookmark.url === url);
      
      if (isBookmarked) {
        // Filled bookmark icon for bookmarked pages
        bookmarkBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>';
        bookmarkBtn.title = 'Remove bookmark';
      } else {
        // Outline bookmark icon for non-bookmarked pages
        bookmarkBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>';
        bookmarkBtn.title = 'Bookmark this page';
      }
    } catch (error) {
      console.warn('Failed to update bookmark button state:', error);
    }
  }

  // Default SVG icon for pages without favicons
  function getDefaultFaviconSVG() {
    const iconColor = getThemeIconColor();
    return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
      <path d="M2 12h20"/>
    </svg>`;
  }

  // Get default favicon as data URI for direct use in img src
  function getDefaultFaviconDataURI() {
    return 'data:image/svg+xml;base64,' + btoa(getDefaultFaviconSVG());
  }

  // Helper function to get theme-appropriate icon color
  function getThemeIconColor() {
    const theme = document.documentElement.getAttribute('data-theme');
    return theme === 'dark' ? '#ffffff' : '#000000';
  }

  async function getFavicon(url) {
    try {
      // Get the current theme color for SVG icons
      const iconColor = getThemeIconColor();
      
      // For nova:// pages, use predefined icons as data URIs with theme-appropriate colors
      if (url.includes('nova://settings')) {
        return `data:image/svg+xml,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        `)}`;
      }
      if (url.includes('nova://bookmarks')) {
        return `data:image/svg+xml,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
          </svg>
        `)}`;
      }
      if (url.includes('nova://history')) {
        return `data:image/svg+xml,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
            <path d="M12 7v5l4 2"/>
          </svg>
        `)}`;
      }
      if (url.includes('nova://about')) {
        return `data:image/svg+xml,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4"/>
            <path d="M12 8h.01"/>
          </svg>
        `)}`;
      }
      if (url.includes('nova://downloads')) {
        return `data:image/svg+xml,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7,10 12,15 17,10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        `)}`;
      }
      if (url.includes('nova://home')) {
        return `data:image/svg+xml,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/>
            <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          </svg>
        `)}`;
      }
      if (url.includes('nova://')) {
        return `data:image/svg+xml,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.341 6.484A10 10 0 0 1 10.266 21.85"/>
            <path d="M3.659 17.516A10 10 0 0 1 13.74 2.152"/>
            <circle cx="12" cy="12" r="3"/>
            <circle cx="19" cy="5" r="2"/>
            <circle cx="5" cy="19" r="2"/>
          </svg>
        `)}`;
      }

      // Try multiple favicon sources for better transparency support
      const domain = new URL(url).hostname;
      
      // Try different favicon sources in order of preference
      const faviconSources = [
        `https://icons.duckduckgo.com/ip3/${domain}.ico`, // Often has better transparency
        `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
        `https://${domain}/favicon.ico`,
        `https://${domain}/favicon.png`
      ];
      
      // Test favicon sources one by one
      for (const faviconUrl of faviconSources) {
        const result = await new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            resolve(faviconUrl);
          };
          img.onerror = () => {
            resolve(null);
          };
          img.src = faviconUrl;
          
          // Shorter timeout for each attempt
          setTimeout(() => {
            resolve(null);
          }, 1500);
        });
        
        if (result) {
          return result;
        }
      }
      
      // If all favicon sources fail, use our default SVG
      return getDefaultFaviconDataURI();
    } catch (error) {
      console.warn('Error getting favicon for', url, error);
      return getDefaultFaviconDataURI();
    }
  }

  // Bookmark folder management functions
  async function createBookmarkFolder(name, parentId = null) {
    try {
      const folders = await novaSettings.get('bookmark-folders', []);
      
      const newFolder = {
        id: Date.now().toString(),
        name: name,
        parentId: parentId,
        dateCreated: new Date().toISOString()
      };
      
      folders.push(newFolder);
      await novaSettings.set('bookmark-folders', folders);
      
      console.debug('Bookmark folder created:', newFolder);
      return newFolder;
    } catch (error) {
      console.error('Failed to create bookmark folder:', error);
      throw error;
    }
  }

  async function getBookmarkFolders() {
    try {
      return await novaSettings.get('bookmark-folders', []);
    } catch (error) {
      console.error('Failed to get bookmark folders:', error);
      return [];
    }
  }

  async function getBookmarksInFolder(folderId) {
    try {
      const bookmarks = await novaSettings.get('bookmarks', []);
      return bookmarks.filter(bookmark => bookmark.folderId === folderId);
    } catch (error) {
      console.error('Failed to get bookmarks in folder:', error);
      return [];
    }
  }

  async function moveBookmarkToFolder(bookmarkId, folderId) {
    try {
      const bookmarks = await novaSettings.get('bookmarks', []);
      const bookmarkIndex = bookmarks.findIndex(b => b.id === bookmarkId);
      
      if (bookmarkIndex !== -1) {
        bookmarks[bookmarkIndex].folderId = folderId;
        await novaSettings.set('bookmarks', bookmarks);
        await loadBookmarksBar();
        console.debug('Bookmark moved to folder:', bookmarkId, folderId);
      }
    } catch (error) {
      console.error('Failed to move bookmark to folder:', error);
    }
  }

  async function loadBookmarksBar() {
    try {
      const bookmarks = await novaSettings.get('bookmarks', []);
      const folders = await novaSettings.get('bookmark-folders', []);
      const container = bookmarksBar.querySelector('.bookmarks-container');
      
      // Clear existing bookmarks (but keep manage button)
      const manageBtn = container.querySelector('.bookmark-manage-btn');
      container.innerHTML = '';
      
      // Get root items (bookmarks and folders without parent)
      const rootBookmarks = bookmarks.filter(b => !b.folderId);
      const rootFolders = folders.filter(f => !f.parentId);
      
      // Combine and sort by date added/created
      const rootItems = [
        ...rootBookmarks.map(b => ({ ...b, type: 'bookmark' })),
        ...rootFolders.map(f => ({ ...f, type: 'folder', dateAdded: f.dateCreated }))
      ].sort((a, b) => new Date(a.dateAdded) - new Date(b.dateAdded));
      
      const maxVisibleItems = 4; // Reduced to show overflow more readily for testing
      const visibleItems = rootItems.slice(0, maxVisibleItems);
      const hiddenItems = rootItems.slice(maxVisibleItems);
      
      // Add visible items
      for (const item of visibleItems) {
        if (item.type === 'bookmark') {
          await addBookmarkItemToBar(container, item);
        } else if (item.type === 'folder') {
          await addFolderItemToBar(container, item, folders, bookmarks);
        }
      }
      
      // Add overflow button if there are hidden items
      if (hiddenItems.length > 0) {
        const overflowBtn = document.createElement('div');
        overflowBtn.className = 'bookmark-overflow-btn';
        overflowBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        `;
        overflowBtn.title = `${hiddenItems.length} more items`;
        
        // Create dropdown menu for hidden items
        const dropdown = document.createElement('div');
        dropdown.className = 'bookmark-overflow-dropdown';
        dropdown.style.display = 'none';
        
        for (const item of hiddenItems) {
          if (item.type === 'bookmark') {
            await addBookmarkItemToDropdown(dropdown, item);
          } else if (item.type === 'folder') {
            await addFolderItemToDropdown(dropdown, item, folders, bookmarks);
          }
        }
        
        // Toggle dropdown on click
        overflowBtn.onclick = (e) => {
          e.stopPropagation();
          const isVisible = dropdown.style.display !== 'none';
          dropdown.style.display = isVisible ? 'none' : 'block';
        };
        
        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
          dropdown.style.display = 'none';
        });
        
        overflowBtn.appendChild(dropdown);
        container.appendChild(overflowBtn);
      }
      
      // Re-add manage button
      if (manageBtn) {
        container.appendChild(manageBtn);
      }
    } catch (error) {
      console.error('Failed to load bookmarks bar:', error);
    }
  }

  async function addBookmarkItemToBar(container, bookmark) {
    const item = document.createElement('div');
    item.className = 'bookmark-item';
    item.title = bookmark.title;
    item.onclick = () => {
      const activeWebview = getActiveWebview();
      if (activeWebview) {
        if (bookmark.url.startsWith('nova://')) {
          handleNovaPage(bookmark.url, activeWebview);
        } else {
          activeWebview.src = bookmark.url;
        }
        urlInput.value = bookmark.url;
      }
    };
    
    const favicon = await getFavicon(bookmark.url);
    
    if (favicon.startsWith('http') || favicon.startsWith('data:image/svg+xml')) {
      item.innerHTML = `
        <img src="${favicon}" alt="" class="bookmark-favicon-img">
        <span class="bookmark-title">${bookmark.title}</span>
      `;
    } else {
      item.innerHTML = `
        <span class="bookmark-favicon">${favicon}</span>
        <span class="bookmark-title">${bookmark.title}</span>
      `;
    }
    
    container.appendChild(item);
  }

  async function addFolderItemToBar(container, folder, allFolders, allBookmarks) {
    const item = document.createElement('div');
    item.className = 'bookmark-folder-item';
    item.title = folder.name;
    
    const folderBookmarks = allBookmarks.filter(b => b.folderId === folder.id);
    const subFolders = allFolders.filter(f => f.parentId === folder.id);
    
    item.innerHTML = `
      <span class="bookmark-folder-icon">📁</span>
      <span class="bookmark-title">${folder.name}</span>
      <span class="bookmark-folder-arrow">▶</span>
    `;
    
    // Create folder dropdown
    const folderDropdown = document.createElement('div');
    folderDropdown.className = 'bookmark-folder-dropdown';
    folderDropdown.style.display = 'none';
    
    // Add bookmarks in folder
    for (const bookmark of folderBookmarks) {
      await addBookmarkItemToDropdown(folderDropdown, bookmark);
    }
    
    // Add subfolders
    for (const subFolder of subFolders) {
      await addFolderItemToDropdown(folderDropdown, subFolder, allFolders, allBookmarks);
    }
    
    if (folderBookmarks.length === 0 && subFolders.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.className = 'bookmark-dropdown-item empty';
      emptyItem.innerHTML = '<span style="color: var(--text-muted); font-style: italic;">Empty folder</span>';
      folderDropdown.appendChild(emptyItem);
    }
    
    // Toggle folder dropdown
    item.onclick = (e) => {
      e.stopPropagation();
      const isVisible = folderDropdown.style.display !== 'none';
      folderDropdown.style.display = isVisible ? 'none' : 'block';
      item.querySelector('.bookmark-folder-arrow').textContent = isVisible ? '▶' : '▼';
    };
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      folderDropdown.style.display = 'none';
      item.querySelector('.bookmark-folder-arrow').textContent = '▶';
    });
    
    item.appendChild(folderDropdown);
    container.appendChild(item);
  }

  async function addBookmarkItemToDropdown(dropdown, bookmark) {
    const dropdownItem = document.createElement('div');
    dropdownItem.className = 'bookmark-dropdown-item';
    dropdownItem.title = bookmark.title;
    dropdownItem.onclick = (e) => {
      e.stopPropagation();
      const activeWebview = getActiveWebview();
      if (activeWebview) {
        if (bookmark.url.startsWith('nova://')) {
          handleNovaPage(bookmark.url, activeWebview);
        } else {
          activeWebview.src = bookmark.url;
        }
        urlInput.value = bookmark.url;
      }
      dropdown.style.display = 'none';
    };
    
    const favicon = await getFavicon(bookmark.url);
    
    if (favicon.startsWith('http') || favicon.startsWith('data:image/svg+xml')) {
      dropdownItem.innerHTML = `
        <img src="${favicon}" alt="" class="bookmark-favicon-img">
        <span class="bookmark-title">${bookmark.title}</span>
      `;
    } else {
      dropdownItem.innerHTML = `
        <span class="bookmark-favicon">${favicon}</span>
        <span class="bookmark-title">${bookmark.title}</span>
      `;
    }
    
    dropdown.appendChild(dropdownItem);
  }

  async function addFolderItemToDropdown(dropdown, folder, allFolders, allBookmarks) {
    const dropdownItem = document.createElement('div');
    dropdownItem.className = 'bookmark-dropdown-folder';
    dropdownItem.title = folder.name;
    
    const folderBookmarks = allBookmarks.filter(b => b.folderId === folder.id);
    const subFolders = allFolders.filter(f => f.parentId === folder.id);
    
    dropdownItem.innerHTML = `
      <span class="bookmark-folder-icon">📁</span>
      <span class="bookmark-title">${folder.name}</span>
      <span class="bookmark-folder-arrow">▶</span>
    `;
    
    // Create nested dropdown for folder contents
    const nestedDropdown = document.createElement('div');
    nestedDropdown.className = 'bookmark-nested-dropdown';
    nestedDropdown.style.display = 'none';
    
    for (const bookmark of folderBookmarks) {
      await addBookmarkItemToDropdown(nestedDropdown, bookmark);
    }
    
    for (const subFolder of subFolders) {
      await addFolderItemToDropdown(nestedDropdown, subFolder, allFolders, allBookmarks);
    }
    
    if (folderBookmarks.length === 0 && subFolders.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.className = 'bookmark-dropdown-item empty';
      emptyItem.innerHTML = '<span style="color: var(--text-muted); font-style: italic;">Empty folder</span>';
      nestedDropdown.appendChild(emptyItem);
    }
    
    dropdownItem.onclick = (e) => {
      e.stopPropagation();
      const isVisible = nestedDropdown.style.display !== 'none';
      nestedDropdown.style.display = isVisible ? 'none' : 'block';
      dropdownItem.querySelector('.bookmark-folder-arrow').textContent = isVisible ? '▶' : '▼';
    };
    
    dropdownItem.appendChild(nestedDropdown);
    dropdown.appendChild(dropdownItem);
  }

  async function initializeBookmarksSystem() {
    try {
      // Check if bookmarks bar should be shown
      const showBookmarksBar = await novaSettings.get('bookmarks-bar', true);
      if (showBookmarksBar) {
        bookmarksBar.classList.add('show');
      }
      
      // Load bookmarks into the bar
      await loadBookmarksBar();
      
    } catch (error) {
      console.error('Failed to initialize bookmarks system:', error);
    }
  }

  async function updateBookmarksBarVisibility() {
    try {
      const showBookmarksBar = await novaSettings.get('bookmarks-bar', true);
      const bookmarksBar = document.getElementById('bookmarks-bar');
      
      if (bookmarksBar) {
        if (showBookmarksBar) {
          bookmarksBar.classList.add('show');
          bookmarksBar.style.display = 'flex';
        } else {
          bookmarksBar.classList.remove('show');
          bookmarksBar.style.display = 'none';
        }
      }
    } catch (error) {
      console.error('Failed to update bookmarks bar visibility:', error);
    }
  }

  // Download page navigation function
  async function openDownloadsPage() {
    console.log('[Nova Renderer] openDownloadsPage called');
    const activeWebview = getActiveWebview();
    console.log('[Nova Renderer] Active webview:', activeWebview);
    if (activeWebview) {
      console.log('[Nova Renderer] Calling handleNovaPage with nova://downloads');
      await handleNovaPage('nova://downloads', activeWebview);
      updateUrlFromWebview(activeWebview);
      console.log('[Nova Renderer] Navigation completed');
    } else {
      console.warn('[Nova Renderer] No active webview found');
    }
  }

  // Make openDownloadsPage available globally
  window.openDownloadsPage = openDownloadsPage;
});

// Theme system initialization
function initializeThemeSystem() {
  console.debug('[Nova Renderer] Initializing theme system...');
  
  loadThemeFromSettings();
  
  window.addEventListener('storage', (e) => {
    if (e.key === 'nova-theme') {
      applyThemeToMainWindow(e.newValue);
    }
  });
  
  window.addEventListener('message', (event) => {
    // Security: Validate message origin to prevent malicious sites from sending messages
    const allowedOrigins = [
      'nova://home',
      'nova://settings', 
      'nova://bookmarks',
      'nova://history',
      'nova://about'
    ];
    
    // Check if the message origin is from a trusted nova:// page
    const isValidOrigin = allowedOrigins.some(origin => event.origin === origin) ||
                         event.origin === window.location.origin ||
                         event.origin === 'null' && event.source === window; // Self-messages
    
    if (!isValidOrigin) {
      console.warn('[Nova Renderer] Rejected message from untrusted origin:', event.origin);
      return;
    }
    
    if (event.data && event.data.type === 'nova-theme-changed') {
      // Additional validation: ensure the theme value is safe
      const validThemes = ['dark', 'light'];
      if (!validThemes.includes(event.data.theme)) {
        console.warn('[Nova Renderer] Invalid theme value received:', event.data.theme);
        return;
      }
      
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
      console.debug('[Nova Renderer] Theme loaded from settings:', theme);
    }
  } catch (error) {
    console.error('[Nova Renderer] Failed to load theme from settings:', error);
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
  
  // Reload bookmarks bar to update SVG favicon colors (with safety check)
  if (typeof loadBookmarksBar === 'function') {
    loadBookmarksBar().catch(error => {
      console.warn('Failed to reload bookmarks bar after theme change:', error);
    });
  }
  
  console.debug('[Nova Renderer] Applied theme to main window:', theme);
}

// Update download badge with current download count
async function updateDownloadBadge() {
  try {
    if (window.novaAPI && window.novaAPI.invoke) {
      const downloads = await window.novaAPI.invoke('get-downloads');
      if (!Array.isArray(downloads)) {
        console.warn('[Nova Renderer] Invalid downloads data received:', downloads);
        return;
      }
      
      const activeDownloads = downloads.filter(d => d && d.state === 'in_progress').length;
      const downloadCountEl = document.getElementById('download-count');
      
      if (downloadCountEl) {
        downloadCountEl.textContent = activeDownloads;
        if (activeDownloads > 0) {
          downloadCountEl.classList.remove('zero');
        } else {
          downloadCountEl.classList.add('zero');
        }
      }
    }
  } catch (error) {
    console.warn('[Nova Renderer] Failed to update download badge:', error);
    // Hide badge on error to avoid showing stale data
    const downloadCountEl = document.getElementById('download-count');
    if (downloadCountEl) {
      downloadCountEl.classList.add('zero');
    }
  }
}

// Initialize download badge on page load
updateDownloadBadge();

// Download notification system
let activeNotifications = new Map();

function createDownloadNotification(downloadItem) {
  try {
    console.log('[Nova Renderer] Creating notification for download:', downloadItem);
    
    // Ensure ID is a string
    const downloadId = String(downloadItem.id);
    
    // Remove any existing notification for this download
    if (activeNotifications.has(downloadId)) {
      removeDownloadNotification(downloadId);
    }

    const notification = document.createElement('div');
    notification.className = 'download-notification';
    notification.id = `download-notification-${downloadId}`;
    
    const fileIcon = getDownloadFileIcon(downloadItem.filename);
    
    // Check if download is already completed
    const isInstantDownload = downloadItem.state === 'completed';
    const title = isInstantDownload ? 'Download Complete' : 'Download Started';
    
    notification.innerHTML = `
      <div class="download-notification-header">
        <div class="download-notification-title">
          ${fileIcon} ${title}
        </div>
        <button class="download-notification-close" data-action="dismiss" data-download-id="${downloadId}">
          ✕
        </button>
      </div>
      <div class="download-notification-content">
        <div class="download-notification-filename">${escapeHtml(downloadItem.filename)}</div>
        <div class="download-notification-url">${escapeHtml(downloadItem.url)}</div>
      </div>
      ${!isInstantDownload ? `
        <div class="download-notification-progress">
          <div class="download-notification-progress-bar">
            <div class="download-notification-progress-fill" id="progress-fill-${downloadId}"></div>
          </div>
          <div class="download-notification-status">
            <span id="progress-text-${downloadId}">Starting download...</span>
            <span id="progress-size-${downloadId}">0 B</span>
          </div>
        </div>
      ` : `
        <div class="download-notification-status">
          <span>Download completed successfully</span>
          <span>${formatDownloadSize(downloadItem.receivedBytes)}</span>
        </div>
      `}
      <div class="download-notification-actions">
        <button class="download-notification-btn primary view-all-btn" data-action="view-all">View All</button>
        ${isInstantDownload ? `
          <button class="download-notification-btn open-folder-btn" data-action="open-folder" data-path="${downloadItem.path}">Open Folder</button>
        ` : `
          <button class="download-notification-btn danger cancel-btn" data-action="cancel" data-download-id="${downloadId}">Cancel</button>
        `}
        <button class="download-notification-btn dismiss-btn" data-action="dismiss" data-download-id="${downloadId}">Dismiss</button>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Add event delegation for notification buttons
    notification.addEventListener('click', async (e) => {
      const button = e.target.closest('[data-action]');
      if (!button) return;
      
      const action = button.dataset.action;
      console.log('[Nova Renderer] Notification button clicked:', action);
      
      switch (action) {
        case 'view-all':
          await openDownloadsPage();
          break;
        case 'open-folder':
          const path = button.dataset.path;
          openDownloadFolder(path);
          break;
        case 'cancel':
          const cancelId = button.dataset.downloadId;
          await cancelDownload(cancelId);
          break;
        case 'dismiss':
          const dismissId = button.dataset.downloadId;
          removeDownloadNotification(dismissId);
          break;
        case 'retry':
          const retryUrl = button.dataset.downloadUrl;
          retryDownloadUrl(retryUrl);
          removeDownloadNotification(downloadId);
          break;
      }
    });
    
    // Trigger animation
    setTimeout(() => {
      notification.classList.add('show');
    }, 100);
    
    // Store reference using string ID
    activeNotifications.set(downloadId, notification);
    console.log('[Nova Renderer] Stored notification with ID:', downloadId);
    
    return notification;
  } catch (error) {
    console.error('[Nova Renderer] Failed to create download notification:', error);
    // Fallback to simple browser notification if available
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Download Started', {
        body: `${downloadItem.filename}`,
        icon: '/assets/logo.png'
      });
    }
  }
}

function updateDownloadNotification(downloadItem) {
  try {
    // Ensure ID is a string
    const downloadId = String(downloadItem.id);
    const notification = activeNotifications.get(downloadId);
    if (!notification) return;
    
    const progressFill = document.getElementById(`progress-fill-${downloadId}`);
    const progressText = document.getElementById(`progress-text-${downloadId}`);
    const progressSize = document.getElementById(`progress-size-${downloadId}`);
    
    if (progressFill && progressText && progressSize) {
      const progress = downloadItem.totalBytes > 0 
        ? Math.round((downloadItem.receivedBytes / downloadItem.totalBytes) * 100)
        : 0;
      
      progressFill.style.width = `${progress}%`;
      
      // Handle different states with appropriate messages
      switch (downloadItem.state) {
        case 'in_progress':
          progressText.textContent = downloadItem.totalBytes > 0 
            ? `${progress}% complete` 
            : 'Downloading...';
          progressSize.textContent = downloadItem.totalBytes > 0
            ? `${formatDownloadSize(downloadItem.receivedBytes)} / ${formatDownloadSize(downloadItem.totalBytes)}`
            : `${formatDownloadSize(downloadItem.receivedBytes)}`;
          break;
        case 'completed':
          progressText.textContent = 'Download complete';
          progressSize.textContent = formatDownloadSize(downloadItem.receivedBytes);
          progressFill.style.width = '100%';
          progressFill.style.backgroundColor = '#4CAF50'; // Green color for completed downloads
          break;
        case 'cancelled':
          progressText.textContent = 'Download cancelled';
          progressSize.textContent = formatDownloadSize(downloadItem.receivedBytes);
          break;
        case 'interrupted':
          progressText.textContent = 'Download failed';
          progressSize.textContent = `${formatDownloadSize(downloadItem.receivedBytes)} (partial)`;
          break;
      }
    }
    
    // Update title based on state
    const titleElement = notification.querySelector('.download-notification-title');
    if (titleElement) {
      const fileIcon = getDownloadFileIcon(downloadItem.filename);
      switch (downloadItem.state) {
        case 'completed':
          titleElement.innerHTML = `${fileIcon} Download Complete`;
          // Replace cancel button with "Open Folder" button for completed downloads
          addOpenFolderButton(notification, downloadItem.path);
          break;
        case 'cancelled':
          titleElement.innerHTML = `${fileIcon} Download Cancelled`;
          // Remove cancel button for cancelled downloads
          removeCancelButton(notification);
          break;
        case 'interrupted':
          titleElement.innerHTML = `${fileIcon} Download Failed`;
          addRetryButton(notification, downloadItem);
          break;
        default:
          titleElement.innerHTML = `${fileIcon} Downloading...`;
      }
    }
  } catch (error) {
    console.error('[Nova Renderer] Failed to update download notification:', error);
    // If there's an error updating, remove the broken notification
    removeDownloadNotification(String(downloadItem.id));
  }
}

function addOpenFolderButton(notification, downloadPath) {
  try {
    const actionsContainer = notification.querySelector('.download-notification-actions');
    if (actionsContainer) {
      // Remove cancel button if it exists
      const cancelBtn = actionsContainer.querySelector('.cancel-btn');
      if (cancelBtn) {
        cancelBtn.remove();
      }
      
      // Add open folder button if it doesn't exist
      if (!actionsContainer.querySelector('.open-folder-btn')) {
        const openFolderBtn = document.createElement('button');
        openFolderBtn.className = 'download-notification-btn open-folder-btn';
        openFolderBtn.textContent = 'Open Folder';
        openFolderBtn.dataset.action = 'open-folder';
        openFolderBtn.dataset.path = downloadPath;
        
        // Insert before the dismiss button
        const dismissBtn = actionsContainer.querySelector('button:last-child');
        actionsContainer.insertBefore(openFolderBtn, dismissBtn);
      }
    }
  } catch (error) {
    console.error('[Nova Renderer] Failed to add open folder button:', error);
  }
}

function removeCancelButton(notification) {
  try {
    const cancelBtn = notification.querySelector('.cancel-btn');
    if (cancelBtn) {
      cancelBtn.remove();
    }
  } catch (error) {
    console.error('[Nova Renderer] Failed to remove cancel button:', error);
  }
}

function addRetryButton(notification, downloadItem) {
  try {
    const actionsContainer = notification.querySelector('.download-notification-actions');
    if (actionsContainer) {
      // Remove cancel button if it exists
      const cancelBtn = actionsContainer.querySelector('.cancel-btn');
      if (cancelBtn) {
        cancelBtn.remove();
      }
      
      // Add retry button if it doesn't exist
      if (!actionsContainer.querySelector('.retry-btn')) {
        const retryBtn = document.createElement('button');
        retryBtn.className = 'download-notification-btn retry-btn';
        retryBtn.textContent = 'Retry';
        retryBtn.dataset.action = 'retry';
        retryBtn.dataset.downloadUrl = downloadItem.url;
        
        // Insert before the dismiss button
        const dismissBtn = actionsContainer.querySelector('button:last-child');
        actionsContainer.insertBefore(retryBtn, dismissBtn);
      }
    }
  } catch (error) {
    console.error('[Nova Renderer] Failed to add retry button:', error);
  }
}

async function cancelDownload(downloadId) {
  try {
    // Ensure ID is a string
    const stringId = String(downloadId);
    
    if (window.novaAPI && window.novaAPI.invoke) {
      const success = await window.novaAPI.invoke('cancel-download', stringId);
      if (success) {
        console.log('[Nova Renderer] Download cancelled successfully:', stringId);
        // The notification will be updated via the download-updated event
      } else {
        console.warn('[Nova Renderer] Failed to cancel download:', stringId);
        alert('Could not cancel download. It may have already completed.');
      }
    } else {
      console.error('[Nova Renderer] NovaAPI not available for cancelling download');
      alert('Could not cancel download - API not available');
    }
  } catch (error) {
    console.error('[Nova Renderer] Failed to cancel download:', error);
    alert('Could not cancel download: ' + error.message);
  }
}

function retryDownload(downloadItem) {
  try {
    // Navigate to the URL to retry the download
    const activeWebview = getActiveWebview();
    if (activeWebview) {
      activeWebview.loadURL(downloadItem.url);
    }
    removeDownloadNotification(downloadItem.id);
  } catch (error) {
    console.error('[Nova Renderer] Failed to retry download:', error);
    alert('Could not retry download. Please try again manually.');
  }
}

function retryDownloadUrl(url) {
  try {
    // Navigate to the URL to retry the download
    const activeWebview = getActiveWebview();
    if (activeWebview) {
      activeWebview.loadURL(url);
    }
  } catch (error) {
    console.error('[Nova Renderer] Failed to retry download:', error);
    alert('Could not retry download. Please try again manually.');
  }
}

function openDownloadFolder(downloadPath) {
  try {
    if (window.novaAPI && window.novaAPI.invoke) {
      window.novaAPI.invoke('open-download-location', downloadPath);
    }
  } catch (error) {
    console.error('[Nova Renderer] Failed to open download folder:', error);
    alert('Could not open download folder');
  }
}

function removeDownloadNotification(downloadId) {
  console.log('[Nova Renderer] Attempting to remove notification:', downloadId);
  console.log('[Nova Renderer] Active notifications:', activeNotifications);
  
  const notification = activeNotifications.get(downloadId);
  console.log('[Nova Renderer] Found notification element:', notification);
  
  if (notification) {
    notification.classList.remove('show');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
      activeNotifications.delete(downloadId);
      console.log('[Nova Renderer] Successfully removed notification:', downloadId);
    }, 300);
  } else {
    console.warn('[Nova Renderer] Could not find notification to remove:', downloadId);
    // Try to find and remove by ID as fallback
    const notificationElement = document.getElementById(`download-notification-${downloadId}`);
    if (notificationElement) {
      console.log('[Nova Renderer] Found notification by ID, removing:', downloadId);
      notificationElement.classList.remove('show');
      setTimeout(() => {
        if (notificationElement.parentNode) {
          notificationElement.parentNode.removeChild(notificationElement);
        }
      }, 300);
    }
  }
}

function getDownloadFileIcon(filename) {
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  const iconMap = {
    // Documents
    'pdf': 'fiv-sqo fiv-icon-pdf',
    'doc': 'fiv-sqo fiv-icon-doc', 'docx': 'fiv-sqo fiv-icon-docx',
    'xls': 'fiv-sqo fiv-icon-xls', 'xlsx': 'fiv-sqo fiv-icon-xlsx',
    'ppt': 'fiv-sqo fiv-icon-ppt', 'pptx': 'fiv-sqo fiv-icon-pptx',
    'txt': 'fiv-sqo fiv-icon-txt',
    'rtf': 'fiv-sqo fiv-icon-rtf',
    'odt': 'fiv-sqo fiv-icon-odt',
    'ods': 'fiv-sqo fiv-icon-ods',
    'odp': 'fiv-sqo fiv-icon-odp',
    
    // Archives
    'zip': 'fiv-sqo fiv-icon-zip', 'rar': 'fiv-sqo fiv-icon-rar', '7z': 'fiv-sqo fiv-icon-7z',
    'tar': 'fiv-sqo fiv-icon-tar', 'gz': 'fiv-sqo fiv-icon-gz', 'bz2': 'fiv-sqo fiv-icon-bz2',
    
    // Images
    'jpg': 'fiv-sqo fiv-icon-jpg', 'jpeg': 'fiv-sqo fiv-icon-jpg', 
    'png': 'fiv-sqo fiv-icon-png', 'gif': 'fiv-sqo fiv-icon-gif', 
    'bmp': 'fiv-sqo fiv-icon-bmp', 'svg': 'fiv-sqo fiv-icon-svg',
    'tiff': 'fiv-sqo fiv-icon-tiff', 'webp': 'fiv-sqo fiv-icon-webp',
    'ico': 'fiv-sqo fiv-icon-ico',
    
    // Video
    'mp4': 'fiv-sqo fiv-icon-mp4', 'avi': 'fiv-sqo fiv-icon-avi', 
    'mkv': 'fiv-sqo fiv-icon-mkv', 'mov': 'fiv-sqo fiv-icon-mov',
    'wmv': 'fiv-sqo fiv-icon-wmv', 'flv': 'fiv-sqo fiv-icon-flv',
    'webm': 'fiv-sqo fiv-icon-webm', 'm4v': 'fiv-sqo fiv-icon-m4v',
    
    // Audio
    'mp3': 'fiv-sqo fiv-icon-mp3', 'wav': 'fiv-sqo fiv-icon-wav', 
    'flac': 'fiv-sqo fiv-icon-flac', 'aac': 'fiv-sqo fiv-icon-aac',
    'ogg': 'fiv-sqo fiv-icon-ogg', 'wma': 'fiv-sqo fiv-icon-wma',
    
    // Executables
    'exe': 'fiv-sqo fiv-icon-exe', 'msi': 'fiv-sqo fiv-icon-msi',
    'deb': 'fiv-sqo fiv-icon-deb', 'rpm': 'fiv-sqo fiv-icon-rpm',
    'dmg': 'fiv-sqo fiv-icon-dmg', 'pkg': 'fiv-sqo fiv-icon-pkg',
    'apk': 'fiv-sqo fiv-icon-apk',
    
    // Code files
    'html': 'fiv-sqo fiv-icon-html', 'css': 'fiv-sqo fiv-icon-css', 
    'js': 'fiv-sqo fiv-icon-js', 'ts': 'fiv-sqo fiv-icon-ts',
    'json': 'fiv-sqo fiv-icon-json', 'xml': 'fiv-sqo fiv-icon-xml',
    'php': 'fiv-sqo fiv-icon-php', 'py': 'fiv-sqo fiv-icon-py',
    'java': 'fiv-sqo fiv-icon-java', 'cpp': 'fiv-sqo fiv-icon-cpp',
    'c': 'fiv-sqo fiv-icon-c', 'h': 'fiv-sqo fiv-icon-h',
    'cs': 'fiv-sqo fiv-icon-cs', 'rb': 'fiv-sqo fiv-icon-rb',
    'go': 'fiv-sqo fiv-icon-go', 'swift': 'fiv-sqo fiv-icon-swift',
    
    // Other common types
    'iso': 'fiv-sqo fiv-icon-iso',
    'torrent': 'fiv-sqo fiv-icon-torrent',
  };
  
  const iconClass = iconMap[extension];
  
  // Return span with CSS class if we have a mapping, otherwise return a default file icon
  if (iconClass) {
    return `<span class="${iconClass}" style="font-size: 42px; margin-right: 10px; opacity: 0.8;"></span>`;
  }
  
  // Default file icon for unknown types
  return `<span class="fiv-sqo fiv-icon-blank" style="font-size: 42px; margin-right: 10px; opacity: 0.8;"></span>`;
}

function formatDownloadSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Make functions globally available for onclick handlers
window.removeDownloadNotification = removeDownloadNotification;
window.openDownloadFolder = openDownloadFolder;
window.retryDownload = retryDownload;
window.cancelDownload = cancelDownload;