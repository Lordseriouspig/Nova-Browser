const { ipcRenderer } = require('electron');

// Allow nova pages to communicate with the browser
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'navigate') {
    // Send navigation request to the renderer process
    ipcRenderer.sendToHost('navigate', event.data.url);
  }
});

// Expose navigation function to webview content
window.navigateFromNova = function(url) {
  ipcRenderer.sendToHost('navigate', url);
};