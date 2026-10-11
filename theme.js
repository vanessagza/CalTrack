(() => {
  const key = 'daily-balance-theme';
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = null;
  const validTheme = value => value === 'dark' || value === 'light';

  try {
    const saved = localStorage.getItem(key);
    if (validTheme(saved)) preference = saved;
    const journal=JSON.parse(localStorage.getItem('daily-balance-v1') || 'null');
    if (journal?.preferences && ['system','light','dark'].includes(journal.preferences.theme)) {
      preference=validTheme(journal.preferences.theme) ? journal.preferences.theme : null;
    }
  } catch { /* Theme switching still works when browser storage is unavailable. */ }

  function applyTheme() {
    const dark = (preference || (systemTheme.matches ? 'dark' : 'light')) === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]').content = document.documentElement.style.getPropertyValue('--bg') || (dark ? '#172238' : '#1d5145');
    const toggle = document.getElementById('theme-toggle');
    if (toggle) toggle.setAttribute('aria-pressed', String(dark));
  }

  // Apply before the stylesheet loads to avoid flashing the wrong theme.
  applyTheme();
  window.DailyBalanceTheme={
    setPreference(value) { preference=validTheme(value) ? value : null;applyTheme(); },
  };
  document.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    document.getElementById('theme-toggle').addEventListener('click', () => {
      preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme();
      window.dispatchEvent(new CustomEvent('appearance-theme-change',{detail:{preference,userInitiated:true}}));
    });
  });
  systemTheme.addEventListener('change', () => {
    if (!preference) {
      applyTheme();
      window.dispatchEvent(new CustomEvent('appearance-theme-change',{detail:{preference:'system',userInitiated:false}}));
    }
  });
})();
