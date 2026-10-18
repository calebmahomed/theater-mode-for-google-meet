// The popup only ever writes chrome.storage.local. bridge.js does the rest: mirrors the value
// into the Meet page's localStorage and tells the MAIN-world scripts about it.
const DEFAULTS = { enabled: true, pip: true, selfHidden: false, barsPinned: false };
const KEYS = Object.keys(DEFAULTS);

const $ = (id) => document.getElementById(id);
const prefs = $('prefs');
const status = $('status');
const reset = $('reset');

let settings = { ...DEFAULTS };
let tabId = null;

const noTab = () => {
  tabId = null;
  status.textContent = 'Open a Meet tab to use it';
  render();
};

const render = () => {
  for (const key of KEYS) $(key).checked = settings[key];
  const off = !settings.enabled;
  prefs.classList.toggle('off', off);
  // Also disable, not just dim: pointer-events alone still leaves them in the tab order, so a
  // keyboard user could Space-toggle a control that looks inert.
  for (const key of ['selfHidden', 'pip', 'barsPinned']) $(key).disabled = off;
  reset.disabled = off || tabId === null;
  if (tabId === null) return;
  status.textContent = settings.enabled ? 'On for this call' : 'Off · Meet looks normal';
};

for (const key of KEYS) {
  $(key).addEventListener('change', (e) => {
    settings[key] = e.target.checked;
    chrome.storage.local.set({ [key]: e.target.checked });
    render();
  });
}

reset.addEventListener('click', async () => {
  if (tabId === null) return;
  try {
    // The popup can sit open for a long time; the tab may be gone since the ping.
    await chrome.tabs.sendMessage(tabId, { type: 'resetStrip' });
  } catch {
    return noTab();
  }
  window.close();
});

// The in-page "Hide me" pill writes the same setting, so without this the popup shows a stale
// toggle and the next click writes a value computed from it.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const key of KEYS) if (key in changes) settings[key] = changes[key].newValue ?? DEFAULTS[key];
  render();
});

const init = async () => {
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;

  const stored = await chrome.storage.local.get(null);
  // Absent keys take the default. A plain spread would let an undefined value through.
  for (const key of KEYS) settings[key] = stored[key] ?? DEFAULTS[key];

  // tab.id needs no "tabs" permission; url and title would. Pinging the bridge is how we tell
  // a Meet tab from anything else without asking for host permissions.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'ping' });
    tabId = tab.id;
    render();
  } catch {
    // No content script there: not a Meet tab, or one open since before the extension loaded.
    noTab();
  }
};

init();
