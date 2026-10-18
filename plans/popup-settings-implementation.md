# Popup settings menu: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the extension a toolbar popup with a master switch, three preference toggles and a strip-reset button, and rewrite the README install section for non-developers.

**Architecture:** `chrome.storage.local` is the source of truth and the only thing the popup can reach. A new ISOLATED-world content script (`bridge.js`) mirrors it into the page's `localStorage` and dispatches a `CustomEvent`. A new MAIN-world content script (`settings.js`) loads before `pip.js` and `layout.js`, reads `localStorage` synchronously at `document_start` so there is no flash of theater mode when the extension is off, and exposes the current settings plus a setter to the other two.

**Tech Stack:** Plain MV3. No build step, no framework, no test runner.

**Spec:** `plans/popup-settings.md`

## Global Constraints

- No build step. Files load exactly as written.
- `storage` is the only permission that may be added. No `scripting`, no `tabs`, no host permissions.
- No `background` key and no `commands` key. The extension keeps no background script.
- `pip.js` and `layout.js` stay in the MAIN world at `document_start`. `bridge.js` is ISOLATED.
- Every `localStorage` access is wrapped in `try {} catch {}`, matching the existing code.
- Defaults: `enabled` on, `pip` on, `selfHidden` off, `barsPinned` off.
- Mirrored `localStorage` values use the existing `'1'` / `''` convention, because `bp-self-hidden` already ships that way.
- Settings changes take effect in the live call. No reload prompts.
- Popup copy is sentence case. Amber `#DFA033` is the only accent.

## Review Focus

Five things the spec implies, none of which any happy-path check would catch:

1. **`localStorage` throws.** With site data blocked, every read in `settings.js` throws. It must fall back to the defaults with the extension *on*, not collapse to off. Covered in Task 1.
2. **Extension context invalidated.** Reloading the unpacked extension while a Meet tab is open makes every `chrome.*` call in `bridge.js` throw. It must fail quietly, not spam the console on each storage event. Covered in Task 1.
3. **First run, empty storage.** All four keys are `undefined`. A naive truthiness read turns `enabled` off and the extension appears broken on install. Covered in Task 1.
4. **Master switched off mid-presentation.** The `bp-presenting` class and the fixed-position tiles must come off immediately, not at the next presentation change. Covered in Task 2.
5. **Popup opened on a non-Meet tab.** `chrome.tabs.sendMessage` rejects with "Receiving end does not exist". It must be caught and shown as a status line, not left as an unhandled rejection. Covered in Task 4.

## Verification note

This repo has no test runner and the work is Chrome-API and DOM glue, so each task ends with manual verification steps in Chrome rather than an automated test. Steps say exactly what to do and what counts as a pass. Do not add a test framework.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `settings.js` | create | MAIN world. Reads mirrored settings from `localStorage` at startup, exposes them plus a setter and a subscribe hook to `pip.js` and `layout.js`. |
| `bridge.js` | create | ISOLATED world. The only file that touches `chrome.*` on the page side. Mirrors `chrome.storage.local` down, relays page writes up, forwards popup commands in. |
| `popup.html` | create | Popup markup and inline styles. |
| `popup.js` | create | Popup behaviour: render from storage, write on change, ping the tab, send reset. |
| `manifest.json` | modify | `action`, `icons`, `permissions`, the `bridge.js` content script, `settings.js` first in the MAIN list. |
| `layout.js` | modify | Gate on `enabled`, route the pill through the setter, honour `barsPinned`, handle reset. |
| `pip.js` | modify | Gate on `enabled` and `pip`, including the `requestWindow` size override. |
| `README.md` | modify | Install section. |
| `CONTEXT.md`, `plans/chrome-web-store.md` | modify | Decision log and roadmap. |

---

## Task 1: Settings plumbing

**Files:**
- Create: `settings.js`, `bridge.js`
- Modify: `manifest.json`

**Interfaces:**
- Consumes: nothing.
- Produces, on `window` in the MAIN world:
  - `window.__bpSettings` — a live object, always `{ enabled: boolean, pip: boolean, selfHidden: boolean, barsPinned: boolean }`. Never null, never partially populated.
  - `window.__bpSet(key: string, value: boolean): void` — updates the object, writes `localStorage` optimistically so in-page UI responds instantly, then dispatches `bp-set` for the bridge to persist.
  - `window.__bpOnSettings(fn: () => void): void` — registers a callback fired after any change, local or from the popup.
- Event contract:
  - `bp-set` — MAIN → ISOLATED. `CustomEvent`, `detail: { key, value }`. Dispatched only by `__bpSet`; the bridge never dispatches it, which is what stops an echo loop.
  - `bp-settings` — ISOLATED → MAIN. Dispatched by the bridge after mirroring a storage change.
  - `bp-reset-strip` — ISOLATED → MAIN. No detail. Task 2 consumes it.
- Storage keys in `chrome.storage.local`: `enabled`, `pip`, `selfHidden`, `barsPinned`.
- Mirrored `localStorage` keys: `bp-enabled`, `bp-pip`, `bp-self-hidden`, `bp-bars-pinned`.

- [ ] **Step 1: Write `settings.js`**

An IIFE, same style as the other two files. Reads the four `localStorage` keys inside one `try {} catch {}`. A key that is absent **or** unreadable takes its default from the Global Constraints — so a thrown read leaves the extension on, and first run leaves it on. Only the exact string `'1'` is true; only an explicitly stored `''` is false.

Implement `__bpSettings`, `__bpSet` and `__bpOnSettings` as described in Interfaces, plus a `bp-settings` listener that re-reads `localStorage` and fires the callbacks.

- [ ] **Step 2: Write `bridge.js`**

An IIFE. On load, `chrome.storage.local.get(null)`, write each of the four keys to its mirrored `localStorage` key, then dispatch `bp-settings`.

Subscribe to `chrome.storage.onChanged` and do the same for changed keys. Listen for `bp-set` on `window` and write `detail.value` to `chrome.storage.local`. Listen for `chrome.runtime.onMessage`: `{ type: 'ping' }` replies `true`; `{ type: 'resetStrip' }` dispatches `bp-reset-strip` on `window`.

Wrap every `chrome.*` call so an invalidated extension context fails silently — check `chrome.runtime?.id` before calling and `try {} catch {}` around it. A reloaded extension must not log on every storage event.

- [ ] **Step 3: Update `manifest.json`**

Add `"permissions": ["storage"]`. Add `"action"` with `"default_popup": "popup.html"`. Add `"icons"` mapping `16`, `32`, `48` and `128` to `icons/16-favicon.png`, `icons/32-windows.png`, `icons/48-extensions.png` and `icons/128-web-store.png`.

Put `settings.js` first in the existing MAIN content script's `js` array, before `pip.js` and `layout.js`. Add a second `content_scripts` entry for `bridge.js` with the same `matches` and `run_at` and no `world` key, so it gets the ISOLATED default.

Do not add `background`, `commands`, `host_permissions` or a `version` bump.

- [ ] **Step 4: Verify the mirror**

Load the unpacked extension, open a Meet call, open DevTools on the page. Everything here runs in the page console.

`__bpSettings` → all four keys present, `enabled` and `pip` `true`, the other two `false`. That is the empty-storage default path.

`__bpSet('barsPinned', true)`, then `localStorage.getItem('bp-bars-pinned')` → `'1'`.

Reload the page. `__bpSettings.barsPinned` is still `true`. This is the step that proves the write reached `chrome.storage` and came back down through the bridge, rather than only touching `localStorage`.

- [ ] **Step 5: Verify the failure modes**

Block site data for `meet.google.com` in Chrome's site settings, reload, and confirm `__bpSettings.enabled` is `true` and the extension still works. Restore the setting.

With the Meet tab open, press reload on the extension card at `chrome://extensions`. Confirm the page console shows no repeated errors from `bridge.js`.

- [ ] **Step 6: Commit**

```bash
git add settings.js bridge.js manifest.json icons/
git commit -m "Add settings plumbing between the popup and the page"
```

---

## Task 2: Gate layout.js

**Files:**
- Modify: `layout.js`

**Interfaces:**
- Consumes: `window.__bpSettings`, `window.__bpSet`, `window.__bpOnSettings` from Task 1, and the `bp-reset-strip` event.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Gate `tick()` on `enabled`**

At the top of `tick()` (`layout.js:133`), when `__bpSettings.enabled` is false: remove `bp-presenting` from `root`, hide `selfBtn` and `handle`, and return. The existing `bp-presenting` toggle already reverts every layout rule, since they are all scoped under that class.

- [ ] **Step 2: Route the pill through the setter**

In the `selfBtn` click handler (`layout.js:47-52`), replace the direct `localStorage.setItem('bp-self-hidden', …)` with `__bpSet('selfHidden', selfHidden)`. Keep the local `selfHidden` variable, the relabel and the `tick()` call so the pill still responds instantly.

Replace the startup read at `layout.js:37` with `__bpSettings.selfHidden`.

- [ ] **Step 3: Honour `barsPinned`**

In the `mousemove` handler (`layout.js:199-207`), skip arming the idle timeout when `__bpSettings.barsPinned` is true. In the `mouseleave` handler (`layout.js:208`), skip removing `bp-bars` when it is true.

- [ ] **Step 4: React to changes and to reset**

Register a `__bpOnSettings` callback that syncs the local `selfHidden` from `__bpSettings`, relabels the pill, adds `bp-bars` when `barsPinned` just became true, and calls `tick()`.

Add a `bp-reset-strip` listener on `window` that clears `bp-strip-xy` and `bp-preview-h` from `localStorage`, restores `x = 8`, `y = 8`, `h = 110` — the file's own defaults at `layout.js:67` — then calls `setH(h)`, `setXY(x, y)` and `tick()`.

- [ ] **Step 5: Verify**

In a call where someone is presenting:

- Set `__bpSet('enabled', false)` in the console. The layout reverts to Meet's own immediately, mid-presentation, without a reload. Set it back to `true` and theater mode returns.
- Click the "Hide me" pill, reload the page, and confirm your tile is still hidden. This is the regression the write-back exists to prevent.
- Set `__bpSet('barsPinned', true)`. Meet's bars stop fading after 2 seconds. Set it back and they fade again.
- Drag the strip to the bottom-right corner, then dispatch `window.dispatchEvent(new CustomEvent('bp-reset-strip'))`. The strip returns to the top-left.

- [ ] **Step 6: Commit**

```bash
git add layout.js
git commit -m "Gate the presenting layout on settings"
```

---

## Task 3: Gate pip.js

**Files:**
- Modify: `pip.js`

**Interfaces:**
- Consumes: `window.__bpSettings` from Task 1.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Gate the keydown handler**

In the Alt+P handler (`pip.js:142-152`), return immediately when `__bpSettings.enabled` is false or `__bpSettings.pip` is false — before `preventDefault`, so the keystroke reaches the page normally when the feature is off.

- [ ] **Step 2: Gate the `requestWindow` wrapper**

In the wrapper (`pip.js:174-178`), when `enabled` is false or `pip` is false, `return requestWindow.call(this, opts)` — the caller's own options, no `WIDTH`/`HEIGHT` override and no `setup(pip)`. This is the part the spec calls out: without it, "off" still forces every Meet PiP window to 480x270.

Read the settings inside the wrapper, not once at module load, so the toggle takes effect without a reload.

- [ ] **Step 3: Verify**

- With `pip` on, open Meet's PiP. The window is 480x270 with the black video-only overlay.
- Set `__bpSet('pip', false)`, close and reopen Meet's PiP. The window is Meet's own default size with Meet's own contents.
- With `pip` off, press Alt+P. Nothing happens.
- Set `__bpSet('enabled', false)` with `pip` still on, and confirm PiP is also off — the master switch wins.

- [ ] **Step 4: Commit**

```bash
git add pip.js
git commit -m "Gate picture-in-picture on settings"
```

---

## Task 4: The popup

**Files:**
- Create: `popup.html`, `popup.js`

**Interfaces:**
- Consumes: the `chrome.storage.local` keys from Task 1, and the `ping` / `resetStrip` messages `bridge.js` handles.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write `popup.html`**

300px wide. Inline `<style>` — MV3's default CSP allows inline styles on extension pages but not inline scripts, so `popup.js` is a separate file loaded with `<script src>`.

Structure, top to bottom:

- Header: the 48px icon, the name "Theater Mode", a status line, and the master toggle.
- Three rows, each a label with an optional description and a toggle:
  - "Hide my tile" — description "While someone is presenting"
  - "Picture-in-picture" — description "Video-only PiP window"
  - "Keep controls visible" — description "Don't fade Meet's bars"
- A divider, then "Preview strip" — description "Dragged off screen? Put it back" — with a Reset button.
- Footer: "Alt+P · picture-in-picture" on the left, a GitHub link on the right, and the version.

Toggles are 36x20 pills with a 16px knob, `#DFA033` when on. Colours follow `prefers-color-scheme`. Copy is sentence case, exactly as written above.

- [ ] **Step 2: Write `popup.js`**

On load: `chrome.storage.local.get(null)`, apply the Global Constraints defaults for absent keys, render all four toggles.

On a toggle click: write the new value to `chrome.storage.local` and re-render. Writing is the whole job — the bridge propagates it.

Master switch: when `enabled` is false, add a dimming class to the three rows and the reset row and ignore clicks on them. Their stored values are untouched, so switching back on restores what the user had.

Set the footer version from `chrome.runtime.getManifest().version`.

Tab state: `chrome.tabs.query({ active: true, currentWindow: true })` for the tab id — this needs no `tabs` permission — then `chrome.tabs.sendMessage(id, { type: 'ping' })`. On success the status line reads "On for this call" or "Off · Meet looks normal" per `enabled`. On rejection, catch it, set the status line to "Open a Meet tab to use it" and disable the Reset button.

Reset button: send `{ type: 'resetStrip' }` to the same tab id, then close the popup.

- [ ] **Step 3: Verify**

- Open the popup on a Meet tab. All four toggles match what the page console reports in `__bpSettings`.
- Flip "Keep controls visible" and watch Meet's bars stop fading without touching the page.
- Flip the master off. The three rows dim. Flip it back on and the previous values are still there, not reset to defaults.
- Drag the strip off screen, open the popup, press Reset. The strip comes back.
- Open the popup on a non-Meet tab, for example a new tab page. The status line reads "Open a Meet tab to use it", Reset is disabled, and the popup's own console shows no unhandled rejection.
- Confirm the footer version matches `manifest.json`.

- [ ] **Step 4: Commit**

```bash
git add popup.html popup.js
git commit -m "Add the toolbar popup"
```

---

## Task 5: Docs

**Files:**
- Modify: `README.md`, `CONTEXT.md`, `plans/chrome-web-store.md`

- [ ] **Step 1: Rewrite the README install section**

Numbered steps, no screenshots. Cover, in order: **Code → Download ZIP** and that it must be unzipped first (loading the `.zip` itself is the usual first failure); `chrome://extensions` with the Arc note the current text already has; **Developer mode** on; **Load unpacked**; that the unpacked folder must be kept where it is, because deleting or moving it breaks the installed extension.

Then a short "Updating" note: download again, replace the folder's contents, press reload on the extension card. Then one line saying a Chrome Web Store release is coming.

- [ ] **Step 2: Document the settings in the README**

Add the popup to the feature list near the top: a master switch, picture-in-picture, hide my tile, keep controls visible, and reset the preview strip.

- [ ] **Step 3: Update `CONTEXT.md`**

Add the new files to the Files section. Add a dated decision-log entry for 2026-10-18 covering: why the bridge exists (MAIN world can't be reached from a popup), why `chrome.storage` is authoritative over `localStorage` for `selfHidden`, that `localStorage` is the synchronous read path that prevents a flash on load, and that the Alt+P `commands` rebinding was considered and rejected to avoid a service worker.

Replace the "Open / next" section with what is actually next.

- [ ] **Step 4: Update the roadmap**

In `plans/chrome-web-store.md`, mark the icons item done, record that the manifest now has `icons` and `storage`, add the popup as a completed item ahead of the strip restyle, and note the `storage` permission in the section 3 privacy notes and the section 7 review notes.

- [ ] **Step 5: Commit**

```bash
git add README.md CONTEXT.md plans/chrome-web-store.md
git commit -m "Document the popup and rewrite the install instructions"
```
