class NovaTheme {
  constructor() {
    this.currentTheme = 'dark';
    this.init();
  }

  init() {
    this.applyStoredTheme();
    
    if (this.isLocalStorageAvailable()) {
      window.addEventListener('storage', (e) => {
        if (e.key === 'nova-theme') {
          this.applyTheme(e.newValue);
        }
      });
    }
  }

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

  async applyStoredTheme() {
    let savedTheme = null;
    
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

  async toggleTheme() {
    const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    
    this.applyTheme(newTheme);
    
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

  getCurrentTheme() {
    return this.currentTheme;
  }

  isDarkMode() {
    return this.currentTheme === 'dark';
  }

  async setTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') {
      console.warn('Invalid theme:', theme);
      theme = 'dark';
    }
    
    this.applyTheme(theme);
    
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
}

window.NovaTheme = new NovaTheme();

window.toggleTheme = () => {
  return window.NovaTheme.toggleTheme();
};
window.setTheme = (theme) => window.NovaTheme.setTheme(theme);
window.getCurrentTheme = () => window.NovaTheme.getCurrentTheme();

window.navigateToUrl = (url) => {
  if (window.navigateFromNova) {
    window.navigateFromNova(url);
  } else {
    window.location.href = url;
  }
};

window.setupBackLink = () => {
  const backLink = document.querySelector('.back-link');
  if (backLink) {
    backLink.addEventListener('click', function(e) {
      e.preventDefault();
      window.navigateToUrl('nova://home');
    });
  }
};

window.dispatchEvent(new CustomEvent('nova-theme-ready', {
  detail: { 
    theme: window.NovaTheme.getCurrentTheme(),
    functions: ['toggleTheme', 'setTheme', 'getCurrentTheme']
  }
}));
