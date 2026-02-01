(()=> {
  // Provide a minimal, persistent fallback when localStorage is unavailable
  // (e.g., older Safari in private/offline contexts).
  let ok = true;
  try {
    const k = '__ls_test__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
  } catch (_) {
    ok = false;
  }

  if (ok) return;

  const parseWindowName = () => {
    try { return JSON.parse(window.name || '{}'); } catch (_) { return {}; }
  };
  const store = parseWindowName();
  const sync = () => { try { window.name = JSON.stringify(store); } catch (_) {} };

  window.localStorage = {
    getItem: (k) => Object.prototype.hasOwnProperty.call(store, k) ? String(store[k]) : null,
    setItem: (k, v) => { store[k] = String(v); sync(); },
    removeItem: (k) => { delete store[k]; sync(); },
    clear: () => { for (const k in store) delete store[k]; sync(); },
    key: (i) => Object.keys(store)[i] || null,
    get length() { return Object.keys(store).length; },
  };
})();
