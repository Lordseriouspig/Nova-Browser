// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
  // Import Electron's ipcRenderer for communicating with main process
  const { ipcRenderer } = require('electron');
  
  // Handle nova:// URLs opened from external sources
  ipcRenderer.on('open-nova-url', (event, url) => {
    const activeWebview = getActiveWebview();
    if (activeWebview) {
      // Open the nova URL in the current active tab
      handleNovaPage(url, activeWebview);
      urlInput.value = url;
    }
  });
  
  // Tab management logic
  const tabsContainer = document.getElementById('tabs');
  const webviewsContainer = document.getElementById('webviews');
  const newTabBtn = document.getElementById('new-tab-btn');
  
  // Toolbar elements
  const backBtn = document.getElementById('back');
  const forwardBtn = document.getElementById('forward');
  const reloadBtn = document.getElementById('reload');
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
  goBtn.addEventListener('click', () => {
    const activeWebview = getActiveWebview();
    if (activeWebview) {
      let url = urlInput.value;
      
      // Handle nova:// internal pages
      if (url.startsWith('nova://')) {
        handleNovaPage(url, activeWebview);
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

  // Handle nova:// internal pages
  function handleNovaPage(url, webview) {
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
    
    loadNovaPage(page, webview);
  }

  // Load nova page from HTML file - automatically finds any page file
  async function loadNovaPage(page, webview) {
    try {
      const path = require('path');
      const fs = require('fs');
      
      // Try to find the page file
      const filePath = path.join(__dirname, 'nova-pages', `${page}.html`);
      
      if (fs.existsSync(filePath)) {
        let htmlContent = fs.readFileSync(filePath, 'utf8');
        
        // Replace any placeholders in the content
        htmlContent = replacePlaceholders(htmlContent, page);
        
        webview.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
      } else {
        // Page doesn't exist, load 404
        load404Page(page, webview);
      }
    } catch (error) {
      console.error('Error loading nova page:', error);
      load404Page(page, webview);
    }
  }

  // Replace placeholders in HTML content
  function replacePlaceholders(htmlContent, page) {
    return htmlContent
      .replace(/\{\{PAGE\}\}/g, page)
      .replace(/\{\{TIMESTAMP\}\}/g, new Date().toISOString())
      .replace(/\{\{VERSION\}\}/g, '1.0.0');
  }

  // Load 404 page with page name
  function load404Page(page, webview) {
    try {
      const path = require('path');
      const fs = require('fs');
      const filePath = path.join(__dirname, 'nova-pages', '404.html');
      
      if (fs.existsSync(filePath)) {
        let htmlContent = fs.readFileSync(filePath, 'utf8');
        htmlContent = replacePlaceholders(htmlContent, page);
        webview.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
      } else {
        // Fallback if 404.html doesn't exist
        webview.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(generateFallback404(page))}`);
      }
    } catch (error) {
      console.error('Error loading 404 page:', error);
      webview.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(generateFallback404(page))}`);
    }
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
    const path = require('path');
    const fs = require('fs');
    
    try {
      const filePath = path.join(__dirname, 'nova-pages', 'home.html');
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8');
      }
    } catch (error) {
      console.error('Error loading home page:', error);
    }
    
    // Fallback home page
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Nova Browser</title>
        <style>
          body { font-family: sans-serif; text-align: center; padding: 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
        </style>
      </head>
      <body>
        <h1>Welcome to Nova Browser</h1>
        <p><a href="nova://settings" style="color: white;">Settings</a> | <a href="nova://about" style="color: white;">About</a></p>
      </body>
      </html>
    `;
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
    webview.addEventListener('ipc-message', (event) => {
      if (event.channel === 'navigate') {
        const url = event.args[0];
        if (url.startsWith('nova://')) {
          handleNovaPage(url, webview);
        } else {
          // Clear nova URL data when navigating to external sites
          delete webview.dataset.novaUrl;
          webview.src = url;
        }
        // Update URL bar
        if (webview.classList.contains('active')) {
          urlInput.value = url;
        }
      }
    });
  }

  // Setup events for the initial webview
  const initialWebview = document.querySelector('.tab-view[data-id="tab-0"]');
  if (initialWebview) {
    setupWebviewEvents(initialWebview);
    // Set initial URL in the input
    urlInput.value = initialWebview.src;
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
    webview.src = 'data:text/html;charset=utf-8,' + encodeURIComponent(generateHomePage());
    webview.className = 'tab-view';
    webview.dataset.id = tabId;
    webview.setAttribute('preload', 'preload.js');

    // Setup events for the new webview
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
});
