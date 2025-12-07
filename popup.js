document.addEventListener('DOMContentLoaded', () => {
  // State
  const state = {
    extensionEnabled: true, // Global
    autoMode: false,
    selectedColor: '#facc15', // Yellow default
    themeMode: 'auto', // 'auto', 'light', 'dark'
    darkMode: false, // Computed
    canUndo: false,
    canRedo: false
  };

  // Themes
  const THEMES = {
    '#facc15': { // Yellow
      primary: '#facc15',
      surface: '#fef9c3',
      border: '#fde047',
      text: '#854d0e',
      darkSurface: '#422006',
      darkBorder: '#713f12',
      darkText: '#fef08a',
      bgTint: '#fefce8', // Very light yellow
      darkBgTint: '#423a08' // Much stronger dark yellow
    },
    '#4ade80': { // Green
      primary: '#4ade80',
      surface: '#dcfce7',
      border: '#86efac',
      text: '#166534',
      darkSurface: '#052e16',
      darkBorder: '#14532d',
      darkText: '#bbf7d0',
      bgTint: '#f0fdf4',
      darkBgTint: '#064020' // Much stronger dark green
    },
    '#38bdf8': { // Blue
      primary: '#38bdf8',
      surface: '#e0f2fe',
      border: '#7dd3fc',
      text: '#075985',
      darkSurface: '#082f49',
      darkBorder: '#0c4a6e',
      darkText: '#bae6fd',
      bgTint: '#f0f9ff',
      darkBgTint: '#083c5c' // Much stronger dark blue
    },
    '#fb7185': { // Pink
      primary: '#fb7185',
      surface: '#ffe4e6',
      border: '#fda4af',
      text: '#9f1239',
      darkSurface: '#4c0519',
      darkBorder: '#881337',
      darkText: '#fecdd3',
      bgTint: '#fff1f2',
      darkBgTint: '#4f0a1f' // Much stronger dark pink
    },
    '#a78bfa': { // Purple
      primary: '#a78bfa',
      surface: '#f3e8ff',
      border: '#d8b4fe',
      text: '#5b21b6',
      darkSurface: '#2e1065',
      darkBorder: '#5b21b6',
      darkText: '#ddd6fe',
      bgTint: '#faf5ff',
      darkBgTint: '#290e4f' // Much stronger dark purple
    }
  };

  // Elements
  const themeToggle = document.getElementById('theme-toggle');

  // Global Toggle Elements
  const globalSwitch = document.getElementById('global-switch');
  const globalCard = document.getElementById('global-card');
  const globalText = document.getElementById('global-text');
  const globalDesc = document.getElementById('global-desc');
  const mainContent = document.getElementById('main-content');

  const modeSwitch = document.getElementById('mode-switch');
  const modeCard = document.getElementById('mode-card');
  const modeStatus = document.getElementById('mode-status'); // Changed from modeText to modeStatus
  const modeDesc = document.getElementById('mode-desc');
  const colorBtns = document.querySelectorAll('.color-btn');
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  const btnClear = document.getElementById('btn-clear');
  const btnPng = document.getElementById('btn-png');
  const btnPdf = document.getElementById('btn-pdf');
  const statusText = document.getElementById('status-text');
  const toast = document.getElementById('toast');
  const iconBox = document.querySelector('.icon-box');

  // Initialize
  init();

  function init() {
    // Set Version from Manifest
    const manifest = chrome.runtime.getManifest();
    const versionSpan = document.getElementById('app-version');
    if (versionSpan) {
      versionSpan.textContent = `v${manifest.version}`;
    }

    // 1. Load Global State from Storage
    chrome.storage.local.get(['extensionEnabled', 'themeMode'], (result) => {
      // Default to true if undefined
      state.extensionEnabled = result.extensionEnabled !== false;
      updateGlobalUI();

      // Load Theme Mode (default 'auto')
      setThemeMode(result.themeMode || 'auto');

      // 2. Load Content Script State
      loadContentState();
    });

    // Listen for messages
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'GET_STATUS') {
        state.canUndo = message.payload.canUndo;
        state.canRedo = message.payload.canRedo;
        // Also update color if it changed externally
        if (message.payload.activeColor !== state.selectedColor) {
          state.selectedColor = message.payload.activeColor;
          applyColorTheme(state.selectedColor);
        }
        updateUI();
      } else if (message.type === 'ERROR') {
        showToast(message.payload);
      }
    });

    // Listen for system theme changes if in auto mode
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (state.themeMode === 'auto') {
        setTheme(e.matches);
      }
    });
  }

  function loadContentState() {
    sendMessage({ type: 'GET_STATUS' }, (response) => {
      if (response) {
        state.autoMode = response.isHighlighting;
        state.selectedColor = response.activeColor;
        state.canUndo = response.canUndo;
        state.canRedo = response.canRedo;
        applyColorTheme(state.selectedColor);
        updateUI();
      } else {
        // Fallback
        applyColorTheme(state.selectedColor);
      }
    });
  }

  // Actions
  themeToggle.addEventListener('click', () => {
    // Cycle: Auto -> Light -> Dark -> Auto
    let nextMode = 'auto';
    if (state.themeMode === 'auto') nextMode = 'light';
    else if (state.themeMode === 'light') nextMode = 'dark';
    else if (state.themeMode === 'dark') nextMode = 'auto';

    setThemeMode(nextMode);
    chrome.storage.local.set({ themeMode: nextMode });
  });

  // Global Switch Action
  globalSwitch.addEventListener('click', () => {
    state.extensionEnabled = !state.extensionEnabled;

    // Save to storage
    chrome.storage.local.set({ extensionEnabled: state.extensionEnabled });

    // Notify content script
    sendMessage({ type: 'TOGGLE_GLOBAL', payload: state.extensionEnabled });

    updateGlobalUI();
  });

  modeSwitch.addEventListener('click', () => {
    if (!state.extensionEnabled) return;
    state.autoMode = !state.autoMode;
    sendMessage({ type: 'TOGGLE_HIGHLIGHT', payload: state.autoMode });
    updateUI();
    setStatus(state.autoMode ? 'AUTO MODE ACTIVE' : 'MANUAL MODE');
  });

  colorBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (!state.extensionEnabled) return;
      const color = e.target.dataset.color;
      state.selectedColor = color;
      applyColorTheme(color);
      sendMessage({ type: 'SET_COLOR', payload: color });
      updateUI();
    });
  });

  btnUndo.addEventListener('click', () => {
    if (state.extensionEnabled) sendMessage({ type: 'UNDO' });
  });
  btnRedo.addEventListener('click', () => {
    if (state.extensionEnabled) sendMessage({ type: 'REDO' });
  });

  btnClear.addEventListener('click', () => {
    if (!state.extensionEnabled) return;
    sendMessage({ type: 'CLEAR_HIGHLIGHTS' });
    setStatus('CLEANED!');
    setTimeout(() => updateUI(), 1500);
  });

  btnPng.addEventListener('click', () => {
    if (state.extensionEnabled) handleExport('EXPORT_PNG');
  });
  btnPdf.addEventListener('click', () => {
    if (state.extensionEnabled) handleExport('EXPORT_PDF');
  });

  // UI Updaters
  function updateGlobalUI() {
    globalSwitch.setAttribute('aria-checked', state.extensionEnabled);

    if (state.extensionEnabled) {
      globalCard.classList.add('active');
      globalText.textContent = 'Extension Enabled';
      globalDesc.textContent = 'Turn off to disable on all sites.';

      // Enable main content
      mainContent.style.opacity = '1';
      mainContent.style.pointerEvents = 'auto';
      mainContent.style.filter = 'none';

      setStatus(state.autoMode ? "AUTO MODE ACTIVE" : "SELECT TO HIGHLIGHT");
    } else {
      globalCard.classList.remove('active');
      globalText.textContent = 'Extension Disabled';
      globalDesc.textContent = 'Turn on to resume highlighting.';

      // Disable main content
      mainContent.style.opacity = '0.5';
      mainContent.style.pointerEvents = 'none';
      mainContent.style.filter = 'grayscale(100%)';

      setStatus("EXTENSION DISABLED");
    }
  }

  function setThemeMode(mode) {
    state.themeMode = mode;
    document.body.setAttribute('data-theme-pref', mode);

    let isDark = false;
    if (mode === 'auto') {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } else if (mode === 'dark') {
      isDark = true;
    } else {
      isDark = false; // light
    }
    setTheme(isDark);
  }

  function setTheme(isDark) {
    state.darkMode = isDark;
    if (isDark) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
    applyColorTheme(state.selectedColor);
  }

  function applyColorTheme(color) {
    const theme = THEMES[color];
    if (!theme) return;

    const root = document.documentElement;
    const isDark = state.darkMode;

    root.style.setProperty('--theme-primary', theme.primary);
    root.style.setProperty('--theme-surface', isDark ? theme.darkSurface : theme.surface);
    root.style.setProperty('--theme-border', isDark ? theme.darkBorder : theme.border);
    root.style.setProperty('--theme-text', isDark ? theme.darkText : theme.text);

    // New deep theming
    root.style.setProperty('--bg-color', isDark ? theme.darkBgTint : theme.bgTint);
    root.style.setProperty('--theme-accent-text', isDark ? theme.darkText : theme.text);
  }

  function updateUI() {
    // Mode
    modeSwitch.setAttribute('aria-checked', state.autoMode);
    if (state.autoMode) {
      modeCard.classList.add('active');
      modeStatus.textContent = 'Auto'; // Updated
      modeDesc.textContent = 'Instant highlight on selection.';
    } else {
      modeCard.classList.remove('active');
      modeStatus.textContent = 'Manual'; // Updated
      modeDesc.textContent = 'Select text to show the menu.';
    }

    // Color
    colorBtns.forEach(btn => {
      if (btn.dataset.color === state.selectedColor) {
        btn.classList.add('selected');
      } else {
        btn.classList.remove('selected');
      }
    });

    // Undo/Redo
    btnUndo.disabled = !state.canUndo;
    btnRedo.disabled = !state.canRedo;

    // Status default (if enabled)
    if (state.extensionEnabled && !statusText.textContent.includes('!') && !statusText.textContent.includes('DISABLED')) {
      statusText.textContent = state.autoMode ? "READY" : "SELECT TO HIGHLIGHT";
    }
  }

  function setStatus(msg) {
    statusText.textContent = msg;
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
  }

  function handleExport(type) {
    setStatus('GENERATING...');
    sendMessage({ type: type }, (response) => {
      if (response && response.status === 'error') {
        showToast(response.message || 'Unknown Error');
        updateUI();
      } else {
        setStatus('COMPLETED');
        setTimeout(() => updateUI(), 2000);
      }
    });
  }

  function sendMessage(msg, cb) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, msg, (response) => {
          if (chrome.runtime.lastError) {
            return;
          }
          if (cb) cb(response);
        });
      }
    });
  }
});
