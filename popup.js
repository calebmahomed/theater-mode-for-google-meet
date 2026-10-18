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

const render = () => {
  for (const key of KEYS) $(key).checked = settings[key];
  prefs.classList.toggle('off', !settings.enabled);
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
  await chrome.tabs.sendMessage(tabId, { type: 'resetStrip' });
  window.close();
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
  } catch {
    // No content script there: not a Meet tab, or one open since before the extension loaded.
    tabId = null;
    status.textContent = 'Open a Meet tab to use it';
    reset.disabled = true;
  }

  render();
};

init();
