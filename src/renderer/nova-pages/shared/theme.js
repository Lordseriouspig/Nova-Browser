/**
 * Shared theme utilities for consistent theming across all Nova pages
 */

class NovaTheme {
  constructor() {
    this.currentTheme = 'dark';
    this.init();
  }

  // Initialize theme system
  init() {
    this.applyStoredTheme();
    
    // Only add storage listener if localStorage is available
    if (this.isLocalStorageAvailable()) {
      window.addEventListener('storage', (e) => {
        if (e.key === 'nova-theme') {
          this.applyTheme(e.newValue);
        }
      });
    }
  }

  // Check if localStorage is available
  isLocalStorageAvailable() {
    try {
      const test = '__nova_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (error) {
      return false;
    }
  }

  // Apply theme from localStorage or Nova settings
  async applyStoredTheme() {
    let savedTheme = null;
    
    // Try to get theme from localStorage if available
    if (this.isLocalStorageAvailable()) {
      try {
        savedTheme = localStorage.getItem('nova-theme');
      } catch (error) {
        console.warn('[Nova Theme] localStorage access denied:', error.message);
      }
    }
    
    let themeToApply = 'dark';
    
    if (savedTheme) {
      themeToApply = savedTheme;
    } else {
      if (window.novaSettings) {
        try {
          const darkMode = await window.novaSettings.get('dark-mode', false);
          themeToApply = darkMode ? 'dark' : 'light';
        } catch (error) {
          console.warn('Could not get theme from Nova settings:', error);
        }
      }
    }
    
    this.applyTheme(themeToApply);
  }

  // Apply theme
  applyTheme(theme) {
    const html = document.documentElement;
    
    if (theme === 'dark') {
      html.setAttribute('data-theme', 'dark');
      this.currentTheme = 'dark';
    } else {
      html.removeAttribute('data-theme');
      this.currentTheme = 'light';
    }

    this.updateThemeToggles();
    
    window.dispatchEvent(new CustomEvent('nova-theme-changed', {
      detail: { theme: this.currentTheme }
    }));
  }

  // Toggle between light and dark theme
  async toggleTheme() {
    const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    
    this.applyTheme(newTheme);
    
    // Save to localStorage if available
    if (this.isLocalStorageAvailable()) {
      try {
        localStorage.setItem('nova-theme', newTheme);
      } catch (error) {
        console.warn('[Nova Theme] Could not save to localStorage:', error.message);
      }
    }
    

    if (window.novaSettings) {
      try {
        await window.novaSettings.set('dark-mode', newTheme === 'dark');
      } catch (error) {
        console.error('Failed to save theme preference to settings:', error);
      }
    }
    
    if (window !== window.parent) {
      try {
        window.parent.postMessage({
          type: 'nova-theme-changed',
          theme: newTheme
        }, '*');
      } catch (error) {
        console.warn('Could not notify parent window of theme change:', error);
      }
    }
    
    return newTheme;
  }

  // Update all theme toggle buttons on the page
  updateThemeToggles() {
    const toggles = document.querySelectorAll('.theme-toggle, .theme-toggle-button, [data-theme-toggle], #themeToggle');
    toggles.forEach(toggle => {
      if (this.currentTheme === 'dark') {
        toggle.textContent = '☀️';
        toggle.setAttribute('title', 'Switch to light mode');
      } else {
        toggle.textContent = '🌙';
        toggle.setAttribute('title', 'Switch to dark mode');
      }
    });
  }

  // Get current theme
  getCurrentTheme() {
    return this.currentTheme;
  }

  // Check if dark mode is active
  isDarkMode() {
    return this.currentTheme === 'dark';
  }

  // Set theme programmatically
  async setTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') {
      console.warn('Invalid theme:', theme);
      theme = 'dark';
    }
    
    this.applyTheme(theme);
    
    // Save to localStorage if available
    if (this.isLocalStorageAvailable()) {
      try {
        localStorage.setItem('nova-theme', theme);
      } catch (error) {
        console.warn('[Nova Theme] Could not save to localStorage:', error.message);
      }
    }
    
    if (window.novaSettings) {
      try {
        await window.novaSettings.set('dark-mode', theme === 'dark');
      } catch (error) {
        console.error('Failed to save theme preference to settings:', error);
      }
    }
    
    return theme;
  }

  async resetToDefaultTheme() {
    // Remove from localStorage if available
    if (this.isLocalStorageAvailable()) {
      try {
        localStorage.removeItem('nova-theme');
      } catch (error) {
        console.warn('[Nova Theme] Could not remove from localStorage:', error.message);
      }
    }
    
    this.applyTheme('dark');
    
    if (window.novaSettings) {
      try {
        await window.novaSettings.set('dark-mode', false);
      } catch (error) {
        console.error('Failed to save default theme to settings:', error);
      }
    }
    
    console.debug('Reset to default theme');
    return 'dark';
  }

  // Load theme from Nova settings
  async loadFromSettings() {
    if (window.novaSettings) {
      try {
        const darkMode = await window.novaSettings.get('dark-mode', false);
        const theme = darkMode ? 'dark' : 'light';
        this.applyTheme(theme);
        
        // Save to localStorage if available
        if (this.isLocalStorageAvailable()) {
          try {
            localStorage.setItem('nova-theme', theme);
          } catch (error) {
            console.warn('[Nova Theme] Could not save to localStorage:', error.message);
          }
        }
        
        return theme;
      } catch (error) {
        console.error('Failed to load theme from settings:', error);
        return this.currentTheme;
      }
    }
    return this.currentTheme;
  }
}

// Create theme instance
window.NovaTheme = new NovaTheme();

// Convenience functions for global access
window.toggleTheme = () => {
  return window.NovaTheme.toggleTheme();
};
window.setTheme = (theme) => window.NovaTheme.setTheme(theme);
window.getCurrentTheme = () => window.NovaTheme.getCurrentTheme();
window.resetToDefaultTheme = () => window.NovaTheme.resetToDefaultTheme();

// Shared navigation function
window.navigateToUrl = (url) => {
  if (window.navigateFromNova) {
    window.navigateFromNova(url);
  } else {
    window.location.href = url;
  }
};

// Shared back link setup function
window.setupBackLink = () => {
  const backLink = document.querySelector('.back-link');
  if (backLink) {
    backLink.addEventListener('click', function(e) {
      e.preventDefault();
      window.navigateToUrl('nova://home');
    });
  }
};

// Dispatch event when theme system is ready
window.dispatchEvent(new CustomEvent('nova-theme-ready', {
  detail: { 
    theme: window.NovaTheme.getCurrentTheme(),
    functions: ['toggleTheme', 'setTheme', 'getCurrentTheme', 'resetToDefaultTheme']
  }
}));
