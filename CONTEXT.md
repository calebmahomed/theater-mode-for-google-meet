# Theater Mode for Google Meet: working context

Chrome MV3 extension, "Theater Mode for Google Meet" (renamed from Meet Better PiP, 2026-10-17). User runs it in Arc. Public repo: https://github.com/calebmahomed/theater-mode-for-google-meet (MIT). Content scripts run in the page's MAIN world at document_start on meet.google.com. No build step; reload the unpacked extension to test.

## Files
- `pip.js`: picture-in-picture.
  - Patches `RTCPeerConnection` to track remote video. A track counts as remote only if its `framesDecoded` keeps increasing, because stale receivers show black.
  - Wraps Meet's Document PiP (`requestWindow`): forces a 480x270 window and adds a black overlay of remote camera videos. Hovering the window reveals Meet's own PiP UI.
  - Alt+P opens native video PiP of the largest remote tile. `pictureInPictureElement` is hidden from Meet, and visibility is spoofed while it's open.
- `layout.js`: layout while *you* present (detected by a video track with `displaySurface`).
  - Your share fills the window, and previews sit in a resizable strip along the top.
  - Meet's top and bottom bars appear on hover. A "Hide me" button hides your own tile.

## Constraints learned
- Meet's class names are obfuscated. Find elements by aria-label (English only) or by track properties.
- Never resize `<main>`. Meet re-lays out, drops tiles and stops their video. Move tiles with `position: fixed` only.
- Meet's CSP and Trusted Types can block `<style>` and `innerHTML` in the PiP doc. Use inline styles there.

## Decision log
- 2026-10-14: Viewing someone else's screen share in Document PiP made the window turn white when the cursor left, and Meet's full-screen button was hidden. Likely cause: the overlay showed the remote screen-share track with `object-fit: cover` and covered Meet's controls.
  - Fix: `sync()` in `pip.js` turns the overlay off whenever a `[aria-label*="zoom in" i]` element exists in the tab or the PiP doc (Meet's presentation zoom controls).
  - **Unverified:** the exact aria-label and whether the fix works. If it's still white, inspect the zoom "+" button's aria-label.

- 2026-10-17: User reported it again while presenting a window: PiP goes white after the cursor leaves, Meet's PiP control pill (chat / apps / host lock) covers the full-screen button, and their own video "jumps around". So the 10-14 fix didn't work.
  - Likely cause of white: the overlay shows a remote share with `object-fit: cover`. Likely cause of jumping: the per-500ms `framesDecoded` check dropped low-fps tracks on alternate polls, so the overlay flipped between our view and Meet's UI.
  - Fix: a track now counts as live if it decoded frames in the last 3s, and overlay videos use `contain`.
  - Still open: the covered full-screen button (Meet's own layout at 480x270?) and a working presentation label. Waiting on a live dump of aria-labels.

- 2026-10-17 (later): The jumping is in the full-window presenting layout (`layout.js`), not PiP, and only happens while someone talks. Likely cause: Meet reorders `main`'s children by active speaker, and `--bp-i` came from DOM order.
  - Fix: order tiles by first-seen participant id.
  - A live label dump (main doc) showed a `Presentation` aria-label and no "zoom in" label, so the 10-14 presentation check never matched. Use `[aria-label="Presentation"]` once confirmed in the PiP doc.

- 2026-10-17 (3rd): The white screen and covered full-screen button are in the **main tab while presenting** (`layout.js`), not PiP.
  - Likely cause of white: the bar-finding walk (up to the first `position: absolute` ancestor) reached a container holding `<main>`, so `.bp-bar { opacity: 0 }` faded the whole call.
  - Likely cause of the covered button: invisible bars still took clicks over the share's bottom-right full-screen button.
  - Fix: never tag a container that holds `<main>`. Hidden bars get `pointer-events: none`, and bars show only when the cursor is within 16px of the top/bottom edge (`html.bp-bars`). Unverified.

- 2026-10-17 (4th): Confirmed the white page and the full-screen button are fixed. But the 16px reveal strip was too hard to hit.
  - Change: bars now show while the cursor is inside any `.bp-bar` rect. While they show, `.bp-pres` shrinks by the bottom bar's height (`--bp-bottom`), so the bar never covers the share's full-screen button. Unverified.
  - The user wants to restyle the preview strip later ("UI here is not great").

- 2026-10-17 (5th): Measured the jump with a 100ms computed-style watcher. On a speaker change, the `.bp-tile` itself animates (left 8→59→227→24→8, width 195→272→195) and then returns. Transform stays `none`, and the blue speaking ring is only `outline-width`, so it doesn't move anything.
  - Cause: Meet's tile transition. CSS transitions beat `!important` in the cascade, so our pinned geometry got animated anyway.
  - Fix: `transition: none !important` on `.bp-tile`. Unverified. If it still jumps without sliding, Meet is setting an inline `!important` style: check `tile.style.cssText`.

- 2026-10-17 (6th): The user rejected shrinking the share when the bars show: the share jumps up, so the cursor leaves the bar and it drops back, and the full-screen button can't be reached. Reverted to a plain fade, and kept the rect-based hover and click-through for hidden bars.
  - Plan: move the share's own controls (full-screen and the zoom pill) to the top right, clear of the bottom bar. Waiting on their aria-labels.
  - The tiles also jump when you mute yourself. Waiting on `tile.style.cssText` / `getAnimations()` captured during a mute.

- 2026-10-17 (7th): A live capture showed the share's controls are `Zoom out` / `Zoom in` buttons in one pill at the bottom right. No full-screen button was found inside `.bp-pres`.
  - Fix: tag the smallest common ancestor of the two buttons as `.bp-zoom`, pinned `position: fixed` at the top right.
  - Tiles carry Meet's inline left/top/width/height (not `!important`) and had no animations, so the mute jump isn't an animation. Still undiagnosed.

- 2026-10-17 (8th): Debugged live via Claude in Chrome (the Meet tab must be in *this* session's tab group).
  - Share controls: a window/screen share has one `Enter full screen` button (48x48 absolute div, bottom-right), not the zoom pill. The pill (`Zoom in`/`Zoom out`) is only for tab shares. The old `.bp-zoom` code looked only for `Zoom in`, so it never matched.
  - Fix: find `[aria-label$="full screen"]` or `[aria-label="Zoom in"]` inside `.bp-pres` and tag its nearest `position: absolute` ancestor. Verified live for the full-screen button; the tab-share pill is untested.
  - Tile jump cause (measured): on a speaker or mute change Meet rewrites each tile's whole `class` attribute, wiping `bp-tile`. The tile sits in Meet's layout (e.g. 889,154 395x526) until the next 500ms tick.
  - Fix: a MutationObserver on `main` (tile class changes and childList) calls `tick()` before the next paint. `bp-zoom` uses `toggle(…, true)`, because `add` rewrites the attribute and would loop the observer. Untested after reload.

- 2026-10-17 (9th): The people/Gemini group (`Call feature notifications and actions`) in the top bar covered the share's top-right controls, and the meeting details (time | code) sat over the preview strip.
  - Fix: dock both groups bottom-left in the bottom bar's empty left side (`.bp-dock`; the people group's `--bp-left` = details' right edge + 8). Pad the top row right by 204px (border-box) so `Stop presenting` stays clear of the pill.
  - Gotchas found live:
    - Meet's bar slide-in `transform` trapped `position: fixed`, so the groups landed at the top. Now `.bp-bar > * { transform: none }`.
    - The top bar's full-width background blocked the pill, so the bar wrappers are click-through and only the row's groups take clicks.
    - Meet sets `pointer-events: auto` on inner groups, so hidden bars still caught clicks. Hidden bars now use `visibility: hidden`.
  - Verified live by injecting the same CSS (elementFromPoint: every control clickable with bars shown; nothing bar-related with them hidden). The reload was then confirmed docked.
  - Tile swap/disappear cause (confirmed): Meet rewrites each tile's whole `style` attribute, wiping the inline `--bp-i`. The `left` calc goes invalid and every tile falls to 16,8, one covering the other. Fix: the slot index is now in `data-bp-i`, mapped to `--bp-i` by 50 generated CSS rules (the observer can't watch `style`: setting it would loop). Not yet verified after reload.

- 2026-10-17 (10th): The user confirmed the docked groups work. Two new items:
  - The blue speaking ring was clipped to just its corners. Cause: Meet draws it as an outline (3px) on a tile-sized inner element, and outlines draw outside the box, where `.bp-tile`'s `overflow: hidden` clips them. First try (`.bp-tile * { outline-offset: -3px }`) failed. A live capture while talking showed the ring is `outline: solid 4px` on a `::after` (24px radius), and `*` doesn't match pseudo-elements. Fix: `.bp-tile *::after { outline-offset: -4px }`. Applied live and confirmed in computed style; the user hasn't confirmed visually yet.
  - Drag to move the strip (was in the original scope). Dragging any tile moves the whole strip via `--bp-x/--bp-y`, saved in `bp-strip-xy`. There's a 4px threshold, and the click that ends a drag is swallowed. Unverified.

- 2026-10-17 (11th): The user wants the same full-window layout when someone *else* presents. Live inspection of the other participant's share: the remote share tile has no `displaySurface`, but its hover controls include `Pin/Unpin <name>'s presentation…`, which is always in the DOM (zero-size when not hovered). No camera tile matches `[aria-label*="presentation" i]`. It also has the `Zoom in`, `Exit/Enter full screen` and `Open in new window` controls.
  - Fix: `presentationVideo()` falls back to the video in the `main` child that matches `[aria-label*="presentation" i]`. Everything else (strip, drag, docking, pill) is unchanged. Detection was verified against the live call (one match); the full layout isn't confirmed until the user reloads.

- 2026-10-17 (12th): Remote-share layout confirmed working by the user. Two follow-ups:
  - The "<name> (Presenting)" toast in the top bar covered `Zoom out`: a remote share's pill is wider (zoom out, %, zoom in, open in new window, full screen) than the fixed 204px reserve. Fix: top-row padding is `var(--bp-pad)` = the pill's measured width + 16, keeping the last width while the pill is hidden (0 wide).
  - Bars reveal changed at the user's request: show on any mouse move, hide after 2s still. They stay up while the cursor rests on a bar or docked group. Both unverified (the call was in PiP when I checked).

## Open / next
All of the 2026-10-17 fixes were confirmed working by the user (presenting, remote share, drag/resize, docked bars, show-on-move bars, speaking ring).
1. See the Roadmap in `plans/chrome-web-store.md` (next up: preview strip restyle).
2. Tab share: the zoom pill move hasn't been explicitly confirmed (window and remote shares were).

Older:
- Confirm the presentation-detection label against a live call. (`Zoom in` exists in the main doc while presenting.)
- Non-English UI isn't supported in either file.
