// Checks settings.js resolves defaults correctly. Run: node test-settings.mjs
// No framework on purpose: this repo has no test runner and doesn't need one.
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('./settings.js', import.meta.url), 'utf8');
const bridgeSource = readFileSync(new URL('./bridge.js', import.meta.url), 'utf8');

// Runs bridge.js against a fake chrome + localStorage. Returns the store it mirrored into
// plus hooks to fire the listeners it registered.
const loadBridge = (stored, seed = {}) => {
  const store = { ...seed };
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  let onChanged;
  const chrome = {
    runtime: { id: 'test', lastError: null, onMessage: { addListener() {} } },
    storage: {
      local: { get: (_, cb) => cb(stored), set() {} },
      onChanged: { addListener: (fn) => { onChanged = fn; } },
    },
  };
  const window = {
    localStorage, chrome, dispatchEvent() {}, addEventListener() {},
    CustomEvent: class { constructor(t) { this.type = t; } },
  };
  window.window = window;
  runInContext(bridgeSource, createContext(window));
  return { store, fireChange: (changes) => onChanged(changes, 'local') };
};

// Runs settings.js against a fake localStorage and returns the window it built.
const load = (store) => {
  const localStorage = store instanceof Error
    ? { getItem() { throw store; }, setItem() { throw store; } }
    : { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const window = {
    localStorage,
    addEventListener() {},
    dispatchEvent() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
  };
  window.window = window;
  runInContext(source, createContext(window));
  return window;
};

const tests = {
  'empty storage leaves the extension on': () => {
    // Spread into this realm: a vm object's prototype is not this realm's Object.prototype.
    const s = { ...load({}).__bpSettings };
    assert.deepEqual(s, { enabled: true, pip: true, selfHidden: false, barsPinned: false });
  },

  'unreadable localStorage leaves the extension on': () => {
    const s = load(new Error('site data blocked')).__bpSettings;
    assert.equal(s.enabled, true);
    assert.equal(s.pip, true);
  },

  'an explicitly stored empty string is false': () => {
    const s = load({ 'bp-enabled': '' }).__bpSettings;
    assert.equal(s.enabled, false);
  },

  'only the string 1 is true': () => {
    const s = load({ 'bp-self-hidden': '1', 'bp-bars-pinned': 'yes' }).__bpSettings;
    assert.equal(s.selfHidden, true);
    assert.equal(s.barsPinned, false);
  },

  '__bpSet writes through to localStorage immediately': () => {
    const store = {};
    const w = load(store);
    w.__bpSet('barsPinned', true);
    assert.equal(store['bp-bars-pinned'], '1');
    assert.equal(w.__bpSettings.barsPinned, true);
  },

  '__bpSet dispatches bp-set for the bridge': () => {
    const sent = [];
    const w = load({});
    w.dispatchEvent = (e) => sent.push(e);
    w.__bpSet('pip', false);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, 'bp-set');
    assert.deepEqual({ ...sent[0].detail }, { key: 'pip', value: false });
  },

  'bp-settings re-reads localStorage and notifies': () => {
    const store = { 'bp-pip': '1' };
    let handler;
    const w = load(store);
    // settings.js registered its bp-settings listener on window; capture and fire it.
    const src = readFileSync(new URL('./settings.js', import.meta.url), 'utf8');
    const w2 = (() => {
      const ls = { getItem: (k) => (k in store ? store[k] : null), setItem() {} };
      const win = { localStorage: ls, dispatchEvent() {}, CustomEvent: class {},
        addEventListener: (t, fn) => { if (t === 'bp-settings') handler = fn; } };
      win.window = win;
      runInContext(src, createContext(win));
      return win;
    })();
    let calls = 0;
    w2.__bpOnSettings(() => { calls++; });
    store['bp-pip'] = '';
    handler();
    assert.equal(w2.__bpSettings.pip, false);
    assert.equal(calls, 1);
  },

  // --- bridge.js ---

  'a key absent from chrome.storage clears the stale mirrored value': () => {
    // The uninstall/reinstall case: chrome.storage is wiped, the page's localStorage is not.
    // Must be removed, not written as '': settings.js reads '' as an explicit false, so a
    // leftover value would outlive the storage it is supposed to mirror.
    const { store } = loadBridge({}, { 'bp-enabled': '', 'bp-self-hidden': '1' });
    assert.equal('bp-enabled' in store, false);
    assert.equal('bp-self-hidden' in store, false);
  },

  'present keys mirror as 1 and empty string': () => {
    const { store } = loadBridge({ enabled: false, pip: true });
    assert.equal(store['bp-enabled'], '');
    assert.equal(store['bp-pip'], '1');
  },

  'a removed key reverts to its default instead of false': () => {
    const { store, fireChange } = loadBridge({ enabled: false });
    assert.equal(store['bp-enabled'], '');
    fireChange({ enabled: { newValue: undefined } });
    assert.equal('bp-enabled' in store, false);
  },

  '__bpOnSettings subscribers fire on a local set': () => {
    const w = load({});
    let calls = 0;
    w.__bpOnSettings(() => { calls++; });
    w.__bpSet('enabled', false);
    assert.equal(calls, 1);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL ${name}\n       ${e.message}`);
  }
}
const total = Object.keys(tests).length;
console.log(`\n${total - failed}/${total} pass`);
process.exit(failed ? 1 : 0);
