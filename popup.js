document.addEventListener('DOMContentLoaded', () => {
  // State
  const state = {
    autoMode: false,
    selectedColor: '#facc15', // Yellow default
    darkMode: false,
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
  const modeSwitch = document.getElementById('mode-switch');
  const modeCard = document.getElementById('mode-card');
  const modeText = document.getElementById('mode-text');
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
    // Theme
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(systemDark);

    // Load state from content script
    sendMessage({ type: 'GET_STATUS' }, (response) => {
      if (response) {
        state.autoMode = response.isHighlighting;
        state.selectedColor = response.activeColor;
        state.canUndo = response.canUndo;
        state.canRedo = response.canRedo;
        applyColorTheme(state.selectedColor);
        updateUI();
      } else {
        // Fallback if content script not ready
        applyColorTheme(state.selectedColor);
      }
    });

    // Listen for messages
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'GET_STATUS') {
        state.canUndo = message.payload.canUndo;
        state.canRedo = message.payload.canRedo;
        // Also update color if it changed externally (though unlikely in this flow)
        if (message.payload.activeColor !== state.selectedColor) {
          state.selectedColor = message.payload.activeColor;
          applyColorTheme(state.selectedColor);
        }
        updateUI();
      } else if (message.type === 'ERROR') {
        showToast(message.payload);
      }
    });
  }

  // Actions
  themeToggle.addEventListener('click', () => {
    setTheme(!state.darkMode);
  });

  modeSwitch.addEventListener('click', () => {
    state.autoMode = !state.autoMode;
    sendMessage({ type: 'TOGGLE_HIGHLIGHT', payload: state.autoMode });
    updateUI();
    setStatus(state.autoMode ? 'MODALITÀ AUTOMATICA ATTIVA' : 'MODALITÀ MANUALE');
  });

  colorBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const color = e.target.dataset.color;
      state.selectedColor = color;
      applyColorTheme(color);
      sendMessage({ type: 'SET_COLOR', payload: color });
      updateUI();
    });
  });

  btnUndo.addEventListener('click', () => sendMessage({ type: 'UNDO' }));
  btnRedo.addEventListener('click', () => sendMessage({ type: 'REDO' }));

  btnClear.addEventListener('click', () => {
    sendMessage({ type: 'CLEAR_HIGHLIGHTS' });
    setStatus('PULITO!');
    setTimeout(() => updateUI(), 1500);
  });

  btnPng.addEventListener('click', () => handleExport('EXPORT_PNG'));
  btnPdf.addEventListener('click', () => handleExport('EXPORT_PDF'));

  // Helpers
  function setTheme(isDark) {
    state.darkMode = isDark;
    if (isDark) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
    // Re-apply color theme to handle dark mode values
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
    // We can also tint the text slightly if we want, but let's stick to background for now as requested "sfondo"
    // Actually user asked for "scritte" too.
    root.style.setProperty('--text-color', isDark ? theme.darkText : theme.text); // This might be too aggressive for all text.
    // Let's use a specific variable for headings or accents instead of replacing global text color which might be too colorful.
    // But user asked "cambiare il colore anche delle scritte". Let's try to be smart.
    // We'll keep main text neutral but tint headers/labels.
    root.style.setProperty('--theme-accent-text', isDark ? theme.darkText : theme.text);
  }

  function updateUI() {
    // Mode
    modeSwitch.setAttribute('aria-checked', state.autoMode);
    if (state.autoMode) {
      modeCard.classList.add('active');
      modeText.textContent = 'Automatico';
      modeDesc.textContent = 'Evidenziazione istantanea alla selezione.';
    } else {
      modeCard.classList.remove('active');
      modeText.textContent = 'Manuale';
      modeDesc.textContent = 'Seleziona testo per mostrare il menu.';
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

    // Status default
    if (!statusText.textContent.includes('!')) {
      statusText.textContent = state.autoMode ? "PRONTO ALL'USO" : "SELEZIONA PER EVIDENZIARE";
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
    setStatus('GENERAZIONE IN CORSO...');
    sendMessage({ type: type }, (response) => {
      if (response && response.status === 'error') {
        showToast(response.message || 'Errore sconosciuto');
        updateUI();
      } else {
        setStatus('COMPLETATO');
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
