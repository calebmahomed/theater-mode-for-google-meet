(() => {
  // Settings for the MAIN-world scripts. bridge.js (ISOLATED world) owns chrome.storage and
  // mirrors it into localStorage; we only ever read localStorage, synchronously, at
  // document_start. That's the point: an async chrome.storage read would let theater mode
  // paint for a frame before we learned the extension is switched off.
  const KEYS = {
    enabled: ['bp-enabled', true],
    pip: ['bp-pip', true],
    selfHidden: ['bp-self-hidden', false],
    barsPinned: ['bp-bars-pinned', false],
  };

  const settings = {};
  const read = () => {
    for (const [name, [key, fallback]] of Object.entries(KEYS)) {
      let raw = null;
      // Blocked site data throws on every read. Fall back to the defaults with the
      // extension ON, so "can't tell" never silently disables it.
      try { raw = localStorage.getItem(key); } catch { raw = null; }
      settings[name] = raw === null ? fallback : raw === '1';
    }
  };
  read();

  const subs = [];
  const notify = () => { for (const fn of subs) fn(); };

  window.__bpSettings = settings;
  window.__bpOnSettings = (fn) => subs.push(fn);

  // Write locally first so in-page UI (the "Hide me" pill) responds without waiting for the
  // chrome.storage round trip, then hand it to the bridge to persist. Only this function
  // dispatches bp-set and only the bridge dispatches bp-settings, so there's no echo loop.
  window.__bpSet = (key, value) => {
    settings[key] = !!value;
    try { localStorage.setItem(KEYS[key][0], value ? '1' : ''); } catch {}
    window.dispatchEvent(new CustomEvent('bp-set', { detail: { key, value: !!value } }));
    notify();
  };

  window.addEventListener('bp-settings', () => { read(); notify(); });
})();
