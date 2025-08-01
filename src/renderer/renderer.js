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
        
        const title = event.title || 'New Tab';
        
        if (closeBtn) {
          closeBtn.remove();
          tabButton.innerText = title;
          tabButton.appendChild(closeBtn);
        } else {
          tabButton.innerText = title;
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

  // Setup events for the initial webview - use async initialization
  async function initializeFirstTab() {
    const initialWebview = document.querySelector('.tab-view[data-id="tab-0"]');
    if (initialWebview) {
      const preloadPath = './preload.js';
      initialWebview.setAttribute('preload', preloadPath);
      
      const homepageUrl = await generateHomePage();
      initialWebview.src = homepageUrl;
      
      setupWebviewListener(initialWebview);
      setupWebviewEvents(initialWebview);
      urlInput.value = homepageUrl;
    }
  }

  // Initialize the first tab
  initializeFirstTab();

  // New tab creation
  newTabBtn.addEventListener('click', async () => {
    const tabId = `tab-${tabCount++}`;

    const tabButton = document.createElement('button');
    tabButton.className = 'tab';
    tabButton.innerText = 'New Tab';
    tabButton.dataset.id = tabId;

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
    return `data:image/svg+xml,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-globe-icon lucide-globe"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
    `)}`;
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

      // For external URLs, try to get favicon through webview API or use fallback
      const domain = new URL(url).hostname;
      
      // Use a simpler approach with data URI fallback
      try {
        // Try Google's favicon service as the primary source
        const googleFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
        
        // Create a test image to check if the favicon loads
        const testResult = await new Promise((resolve) => {
          const testImg = new Image();
          testImg.crossOrigin = 'anonymous';
          
          const timeout = setTimeout(() => {
            resolve(null);
          }, 2000);
          
          testImg.onload = () => {
            clearTimeout(timeout);
            resolve(googleFavicon);
          };
          
          testImg.onerror = () => {
            clearTimeout(timeout);
            resolve(null);
          };
          
          testImg.src = googleFavicon;
        });
        
        if (testResult) {
          return testResult;
        }
      } catch (error) {
        console.warn('Failed to load favicon from Google service:', error);
      }
      
      // If all external sources fail, use our default SVG
      return getDefaultFaviconSVG();
    } catch (error) {
      console.warn('Error getting favicon for', url, error);
      return getDefaultFaviconSVG();
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
      'nova://about',
      'nova://test'
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
