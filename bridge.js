(() => {
  // ISOLATED world: the only file on the page side that touches chrome.*. The popup can't
  // reach the MAIN-world scripts (different origin), so settings travel
  // popup -> chrome.storage.local -> here -> the page's localStorage -> a bp-settings event.
  // An ISOLATED content script shares the page's DOM and localStorage, just not its JS context.
  const KEYS = {
    enabled: 'bp-enabled',
    pip: 'bp-pip',
    selfHidden: 'bp-self-hidden',
    barsPinned: 'bp-bars-pinned',
  };

  // Reloading the unpacked extension invalidates this context, and every chrome.* call then
  // throws. Without the guard that's one console error per storage event, forever.
  const alive = () => {
    try { return !!chrome.runtime?.id; } catch { return false; }
  };

  const mirror = (values) => {
    for (const [name, key] of Object.entries(KEYS)) {
      if (!(name in values)) continue;
      try { localStorage.setItem(key, values[name] ? '1' : ''); } catch {}
    }
    window.dispatchEvent(new CustomEvent('bp-settings'));
  };

  if (alive()) {
    try {
      chrome.storage.local.get(null, (values) => {
        if (chrome.runtime.lastError) return;
        mirror(values ?? {});
      });
    } catch {}
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !alive()) return;
      const values = {};
      for (const [name, change] of Object.entries(changes)) {
        if (name in KEYS) values[name] = change.newValue;
      }
      if (Object.keys(values).length) mirror(values);
    });
  } catch {}

  // settings.js dispatches this when something in the page changes a setting (the "Hide me"
  // pill). It has already written localStorage, so we only persist; the resulting onChanged
  // mirrors the same value back down, which is a no-op.
  window.addEventListener('bp-set', (e) => {
    const { key, value } = e.detail ?? {};
    if (!(key in KEYS) || !alive()) return;
    try { chrome.storage.local.set({ [key]: !!value }); } catch {}
  });

  try {
    chrome.runtime.onMessage.addListener((msg, sender, respond) => {
      if (msg?.type === 'ping') { respond(true); return false; }
      if (msg?.type === 'resetStrip') {
        window.dispatchEvent(new CustomEvent('bp-reset-strip'));
        respond(true);
        return false;
      }
      return false;
    });
  } catch {}
})();
