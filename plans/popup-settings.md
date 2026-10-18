# Popup settings menu: design

Status: design, awaiting approval (2026-10-18).

## Intent

The extension has no UI. Every behaviour is either automatic or bound to a key, and the only visible control is a "Hide me" pill that appears on hover inside the preview strip. That is fine for the person who wrote it and bad for everyone else: there is no way to discover what the extension does, no way to turn it off without removing it, and no way to recover a preview strip that has been dragged off screen.

A toolbar popup fixes all three. It is also the thing a Chrome Web Store reviewer and a first-time user look for, so it should exist before submission.

## Goals

- A settings menu reachable from the toolbar icon on any tab.
- A master switch that returns Meet to normal without uninstalling.
- Independent switches for picture-in-picture and for Meet's auto-hiding bars.
- A way to recover the preview strip when it has been dragged out of reach.
- Install instructions in the README that a non-developer can follow.

## Non-goals

- Per-meeting or per-account settings. One global set of preferences.
- Syncing settings between machines.
- Any options page separate from the popup. The popup is the whole surface.
- Restyling the in-call preview strip. That is roadmap item 1 and stays separate.
- Localisation. The extension is English-only and the popup matches.

## Anti-goals

These would make the feature a failure even if it worked:

- **A second new permission.** The listing's main virtue is that it asks for nothing. `storage` is the budget; anything beyond it needs a fresh decision.
- **A flash of theater mode on load when the extension is switched off.** Off has to mean off from the first paint, not after an async round trip.
- **Settings that need a page reload to apply.** Every toggle takes effect in the live call.
- **A build step.** The repo has none and should keep none.

## Constraints

- `pip.js` and `layout.js` run in the page's **MAIN** world at `document_start`. A popup is an extension page on a different origin and cannot read or write their state directly.
- Content scripts in the **ISOLATED** world share the page's DOM and its `localStorage`, but not its JS context.
- `chrome.storage` is async. Anything needed at `document_start` has to come from a synchronous source.
- Existing persisted state lives in `meet.google.com`'s `localStorage`: `bp-self-hidden`, `bp-strip-xy`, `bp-preview-h`.
- Meet's CSP and Trusted Types can block `<style>` and `innerHTML` injection in some documents. This does not affect the popup itself, which is an extension page.
- No build step. Plain HTML, CSS and JS files, loaded as they are.

## Architecture

Settings have two homes, deliberately:

- **`chrome.storage.local`** is the channel between the popup and the page. The popup can only reach this.
- **The page's `localStorage`** is the fast read path. `pip.js` and `layout.js` read it synchronously at `document_start`, which is what prevents the flash-of-theater-mode anti-goal.

A new ISOLATED-world content script, `bridge.js`, keeps the second in step with the first:

1. On load, read `chrome.storage.local` and mirror every value into the page's `localStorage`.
2. Subscribe to `chrome.storage.onChanged`. On any change, update `localStorage` and dispatch a `CustomEvent` on `window` so the MAIN-world scripts can react without polling.
3. Listen for `chrome.runtime` messages from the popup and forward one-shot commands into the page the same way.
4. Listen for one `CustomEvent` in the other direction, so a setting changed from inside the page can be written back to `chrome.storage`.

`pip.js` and `layout.js` read `localStorage` at startup and listen for the event afterwards. Neither needs to know `chrome.*` exists.

### Two writers for `selfHidden`

The in-strip "Hide me" pill already writes `bp-self-hidden` directly, and it stays. That gives the setting two writers in two different worlds, so the design needs a precedence rule or the pill silently un-does itself on the next page load.

**`chrome.storage` is always authoritative.** The pill no longer writes `localStorage` directly; it dispatches the write-back event in step 4, the bridge puts the value in `chrome.storage`, and the resulting `onChanged` mirrors it back down. The page's `localStorage` is a cache that only the bridge writes.

This keeps the bridge one-way for reconciliation — there is no merge, no load-time tie-break and no echo loop to suppress — at the cost of one extra event hop when the pill is clicked. That hop is not on a hot path.

### Why not `scripting`

The alternative is for the popup to call `chrome.scripting.executeScript` into the MAIN world. It avoids the bridge file but costs the `scripting` permission, which is broader and reads worse on the listing than `storage`. Rejected.

## Settings

| Key | Default | Effect |
|---|---|---|
| `enabled` | on | Master. Off means Meet behaves exactly as it does without the extension. |
| `pip` | on | The Document PiP overlay and the Alt+P native PiP handler. |
| `selfHidden` | off | Hides your own camera tile **while someone is presenting**. Mirrors the existing `bp-self-hidden`. |
| `barsPinned` | off | On, Meet's bars stop fading after 2 seconds. |

`enabled` is a master switch above the other three, not a sibling: switching it off suspends all behaviour regardless of the others' values, and the popup shows them dimmed but keeps their state so switching back on restores what the user had.

Strip geometry (`bp-strip-xy`, `bp-preview-h`) is **not** moved into `chrome.storage`. It is written continuously while dragging, and round-tripping every mousemove through an async API is waste. It stays in `localStorage` and is only ever touched from the popup by the reset command below.

### Reset preview strip

A button, not a toggle, because it is a trap door rather than a preference: a strip dragged past the window edge cannot currently be recovered without clearing site data.

The popup sends a one-shot `resetStrip` message to the active tab. `layout.js` clears the two `localStorage` keys and returns the strip to its default position and height. If no tab answers, the popup shows "Open a Meet tab first" instead of reporting success.

### Turning the master switch off mid-call

`layout.js` is entirely CSS classes on `<html>`, so removing them reverts Meet instantly.

`pip.js` patches `RTCPeerConnection` at `document_start` and that patch cannot be meaningfully withdrawn mid-session. It does not need to be: the patch only tracks decode statistics and has no visible effect.

`pip.js` also wraps `DocumentPictureInPicture.prototype.requestWindow` and forces every PiP window Meet opens to 480x270. That one **is** visible, so it has to be gated too, or "Meet behaves exactly as it does without the extension" is false. With `pip` or the master switch off, the wrapper passes the caller's original options straight through and adds no overlay.

So "off" means: no overlay, no forced window size, and Alt+P ignored. All three are live decisions checked per call, so no reload prompt is needed.

## The popup

Roughly 300px wide, the normal width for a Chrome popup. Top to bottom:

- **Header.** The extension icon, the name, a one-line status ("On for this call" / "Off · Meet looks normal"), and the master toggle on the right.
- **Three rows**, each a label with an optional one-line description and a toggle: Hide my tile, Picture-in-picture, Keep controls visible.
- **A divider**, then the Preview strip row with a Reset button.
- **Footer.** The Alt+P shortcut, and a GitHub link.

The version number is shown in the footer area, read from `chrome.runtime.getManifest().version` so it never drifts from the manifest.

With the master switch off, the three rows and the reset row are dimmed and non-interactive. The header and footer stay live.

One charcoal surface in both browser themes, not a light/dark pair. That is the palette already
recorded in `plans/chrome-web-store.md` — charcoal base, one warm accent, white text — and it is
what lets the toggle use the brand `#FFCE1B` unchanged.

On a white surface `#FFCE1B` is 1.49:1, below the 3:1 WCAG 1.4.11 asks of a state indicator, so
a light popup forces a duller gold that visibly does not match the toolbar icon sitting inches
away. On charcoal it is 11.06:1. The off-state grey is `#80868B` (4.47:1); `#5F6368` was tried
first and fails at 2.72:1.

"Hide my tile" is deliberately duplicated between the popup and the existing in-strip pill. The pill is faster mid-call; the popup is where someone looks when they do not know the pill exists.

That row carries the description **"While someone is presenting"**, because hiding your own tile only has an effect inside theater mode — `layout.js` tags tiles and applies `bp-self-hidden` only under `html.bp-presenting`. The label is static rather than a live greyed-out state: making it dynamic would mean the popup querying the tab for presentation status and keeping it current while open, which is work in exchange for nothing the sentence does not already say.

Making the setting work in a normal grid call was considered and rejected for now. It is a separate feature — tiles would have to be tagged and CSS injected outside theater mode, and the self tile found in Meet's untouched grid — with its own live-debugging cycle against obfuscated markup.

## Shortcut

Alt+P stays exactly where it is: a hardcoded `keydown` listener in `pip.js`. The popup footer displays it as static text.

Moving it to a `commands` entry would let users rebind it at `chrome://extensions/shortcuts`, but `chrome.commands` events can only be received in a service worker, and a `commands` shortcut is global rather than scoped to the Meet tab. Forwarding it to whichever tab is active breaks the main case — `pip.js` goes to real trouble spoofing `hidden` and `visibilityState` so you can switch away from Meet while PiP is up, and from that other tab an active-tab forward does nothing. Targeting it properly means the worker tracking which tab owns the PiP. That is a lot of new surface, including the extension's first background script, to buy rebinding. Rejected.

**So there is no `background.js` and no `commands` block.** `storage` stays the only new permission.

## Manifest changes

- `action` with `default_popup`.
- `permissions: ["storage"]`.
- A second `content_scripts` entry for `bridge.js`: same `matches`, same `run_at`, ISOLATED world (the default).

No `background` key and no `commands` key. The extension still has no background script.

- `icons`, pointing at the four PNGs already in `icons/`: `16-favicon.png`, `32-windows.png`, `48-extensions.png`, `128-web-store.png`. The `action` needs them for the toolbar button, so they are wired here rather than waiting for roadmap item 4. The `version` bump to `1.0.0` still belongs to item 4.

`storage` is the only new permission, and the only one beyond the `meet.google.com` content-script match. The review notes should state that it holds four booleans on the user's machine and that nothing is sent anywhere.

## README install instructions

The existing three steps are correct but assume a developer. Rewrite the Install section to cover:

- The ZIP path explicitly: **Code → Download ZIP**, then unzip. Loading the `.zip` itself is the most common first failure.
- That the unpacked folder must be kept. Deleting or moving it breaks the installed extension.
- `chrome://extensions` and the Arc equivalent, which the current text already notes.
- How to update: download again, replace the folder's contents, press reload on the extension card.
- A line saying the Web Store version is coming, so people know this is temporary.

Keep it short. Numbered steps, no screenshots.

## Left to the builder

- File layout for the popup (one `popup.js` or several). One is almost certainly right at this size.
- The exact `CustomEvent` name and payload shape between `bridge.js` and the MAIN-world scripts.
- Whether `layout.js` and `pip.js` share a tiny settings reader or each read `localStorage` themselves. They currently share nothing.
- Default strip position used by reset. Match whatever `layout.js` already falls back to.
- Markup and CSS of the popup, within the layout described above.

## Roadmap placement

This work slots in before roadmap item 1 (the preview strip restyle) in `plans/chrome-web-store.md`, because it is what a reviewer and a first-time user look for and because the restyle is cosmetic.

The two overlap only at the "Hide me" pill, and only through its *state*, not its markup. The precedence rule above means the restyle can move or redraw the pill freely as long as it keeps dispatching the write-back event.

## Open

- Logo: whether to ship one mark at every size, or the full composition at 128/48 and a reduced one at 32/16. Does not block this work.
