// Checks settings.js resolves defaults correctly. Run: node test-settings.mjs
// No framework on purpose: this repo has no test runner and doesn't need one.
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('./settings.js', import.meta.url), 'utf8');

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
