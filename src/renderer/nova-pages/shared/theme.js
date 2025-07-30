/**
 * Nova Browser Theme System
 * Shared theme utilities for consistent theming across all Nova pages
 */

class NovaTheme {
  constructor() {
    this.currentTheme = 'light';
    this.init();
  }

  // Initialize theme system
  init() {
    // Apply saved theme immediately
    this.applyStoredTheme();
    
    // Listen for theme changes from other pages
    window.addEventListener('storage', (e) => {
      if (e.key === 'nova-theme') {
        this.applyTheme(e.newValue);
      }
    });
  }

  // Apply theme from localStorage or Nova settings
  async applyStoredTheme() {
    const savedTheme = localStorage.getItem('nova-theme');
    
    let themeToApply = 'light'; // Default to light theme
    
    if (savedTheme) {
      // Use saved preference
      themeToApply = savedTheme;
    } else {
      // Try to get from Nova settings as fallback
      if (window.novaSettings) {
        try {
          const darkMode = await window.novaSettings.get('dark-mode', false);
          themeToApply = darkMode ? 'dark' : 'light';
        } catch (error) {
          console.log('Could not get theme from Nova settings, using default light theme:', error);
        }
      }
      
      console.log('No stored theme preference, using default light theme');
    }
    
    this.applyTheme(themeToApply);
  }

  // Apply theme to document
  applyTheme(theme) {
    const html = document.documentElement;
    
    if (theme === 'dark') {
      html.setAttribute('data-theme', 'dark');
      this.currentTheme = 'dark';
    } else {
      html.removeAttribute('data-theme');
      this.currentTheme = 'light';
    }

    // Update theme toggle buttons if they exist
    this.updateThemeToggles();
    
    // Dispatch theme change event
    window.dispatchEvent(new CustomEvent('nova-theme-changed', {
      detail: { theme: this.currentTheme }
    }));
  }

  // Toggle between light and dark theme
  async toggleTheme() {
    const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    
    // Apply theme immediately
    this.applyTheme(newTheme);
    
    // Store preference
    localStorage.setItem('nova-theme', newTheme);
    
    // Update settings if available
    if (window.novaSettings) {
      try {
        await window.novaSettings.set('dark-mode', newTheme === 'dark');
      } catch (error) {
        console.error('Failed to save theme preference to settings:', error);
      }
    }
    
    // Notify main window via postMessage if we're in a webview
    if (window !== window.parent) {
      try {
        window.parent.postMessage({
          type: 'nova-theme-changed',
          theme: newTheme
        }, '*');
      } catch (error) {
        console.log('Could not notify parent window of theme change:', error);
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
      console.warn('Invalid theme:', theme, 'Using light theme instead');
      theme = 'light';
    }
    
    this.applyTheme(theme);
    localStorage.setItem('nova-theme', theme);
    
    // Update settings if available
    if (window.novaSettings) {
      try {
        await window.novaSettings.set('dark-mode', theme === 'dark');
      } catch (error) {
        console.error('Failed to save theme preference to settings:', error);
      }
    }
    
    return theme;
  }

  // Reset to default light theme
  async resetToDefaultTheme() {
    // Remove stored preference to use default light theme
    localStorage.removeItem('nova-theme');
    
    // Apply light theme
    this.applyTheme('light');
    
    // Update settings
    if (window.novaSettings) {
      try {
        await window.novaSettings.set('dark-mode', false);
      } catch (error) {
        console.error('Failed to save default theme to settings:', error);
      }
    }
    
    console.log('Reset to default light theme');
    return 'light';
  }

  // Load theme from Nova settings
  async loadFromSettings() {
    if (window.novaSettings) {
      try {
        const darkMode = await window.novaSettings.get('dark-mode', false);
        const theme = darkMode ? 'dark' : 'light';
        this.applyTheme(theme);
        localStorage.setItem('nova-theme', theme);
        return theme;
      } catch (error) {
        console.error('Failed to load theme from settings:', error);
        return this.currentTheme;
      }
    }
    return this.currentTheme;
  }
}

// Create global theme instance
console.log('Creating NovaTheme instance...');
window.NovaTheme = new NovaTheme();

// Convenience functions for global access
window.toggleTheme = () => {
  console.log('toggleTheme called');
  return window.NovaTheme.toggleTheme();
};
window.setTheme = (theme) => window.NovaTheme.setTheme(theme);
window.getCurrentTheme = () => window.NovaTheme.getCurrentTheme();
window.resetToDefaultTheme = () => window.NovaTheme.resetToDefaultTheme();

console.log('Nova Theme system loaded. Available functions:', {
  toggleTheme: typeof window.toggleTheme,
  setTheme: typeof window.setTheme,
  getCurrentTheme: typeof window.getCurrentTheme,
  resetToDefaultTheme: typeof window.resetToDefaultTheme
});

// Dispatch event when theme system is ready
window.dispatchEvent(new CustomEvent('nova-theme-ready', {
  detail: { 
    theme: window.NovaTheme.getCurrentTheme(),
    functions: ['toggleTheme', 'setTheme', 'getCurrentTheme', 'resetToDefaultTheme']
  }
}));
