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

  // undefined means "chrome.storage has no opinion", which must REMOVE the mirrored value, not
  // write ''. settings.js reads '' as an explicit false, so a leftover key would outlive the
  // storage it mirrors: uninstall/reinstall wipes chrome.storage but not the page's
  // localStorage, and the extension would come back stuck off while the popup showed it on.
  // The defaults live in settings.js only; duplicating them here is how the two drift apart.
  const write = (key, value) => {
    try {
      if (value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, value ? '1' : '');
    } catch {}
  };

  const mirror = (values) => {
    for (const [name, key] of Object.entries(KEYS)) write(key, values[name]);
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
      let touched = false;
      for (const [name, change] of Object.entries(changes)) {
        if (!(name in KEYS)) continue;
        write(KEYS[name], change.newValue);
        touched = true;
      }
      if (touched) window.dispatchEvent(new CustomEvent('bp-settings'));
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
