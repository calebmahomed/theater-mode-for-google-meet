(() => {
  // While you present: shared screen fills the window, previews in a strip along the top
  // (drag any edge or corner to resize), top/bottom bars overlay and show on hover.
  // Meet's class names are obfuscated, so we tag elements ourselves every tick.
  // Tiles are moved with position:fixed only; <main> keeps its size, otherwise Meet
  // re-lays out, drops participant tiles and stops receiving their video.
  const root = document.documentElement;
  const style = document.createElement('style');
  style.textContent = `
    html.bp-presenting .bp-pres { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; z-index: 1 !important; background: #000 !important; }
    /* ^ black: the share is object-fit contain, so its letterbox bands are transparent and showed
       Meet's grey page background (rgb(19, 19, 20) on the root c-wiz). */
    html.bp-presenting .bp-tile { position: fixed !important; top: var(--bp-y) !important; left: calc(var(--bp-x) + var(--bp-i) * (var(--bp-h) * 16 / 9 + 8px)) !important; width: calc(var(--bp-h) * 16 / 9) !important; height: var(--bp-h) !important; z-index: 3 !important; border-radius: var(--bp-r, 16px) !important; overflow: hidden !important; transition: none !important; user-select: none; cursor: grab; }
    /* Meet's speaking ring is a 4px outline on a tile-sized ::after; draw it inside so overflow doesn't clip it. */
    html.bp-presenting .bp-tile *::after { outline-offset: -4px !important; }
    html.bp-presenting :is(.bp-pres, .bp-tile) :is([data-ssrc], video) { left: 0 !important; top: 0 !important; width: 100% !important; height: 100% !important; }
    /* Hidden bars use visibility, not just pointer-events: Meet sets pointer-events:auto on inner groups. */
    html.bp-presenting .bp-bar { position: fixed !important; z-index: 2 !important; opacity: 0; visibility: hidden; transition: opacity .2s, visibility .2s; }
    html.bp-presenting.bp-bars .bp-bar { opacity: 1; visibility: visible; }
    /* Bottom bar only. The top bar (the one holding the docked groups) sits above the share, and
       the share's full-screen/zoom pill can't be raised over it: it's trapped inside .bp-pres's
       stacking context. An opaque top bar hides the pill, so the top bar stays transparent. */
    html.bp-presenting .bp-bar:not(:has(.bp-dock)) { background: #000 !important; }
    /* Meet slides bars in with a transform, which would trap the position:fixed docked groups. */
    html.bp-presenting .bp-bar > * { transform: none !important; }
    /* Fades with the bars: idle should show video and nothing else. */
    html.bp-presenting .bp-zoom { position: fixed !important; top: 8px !important; right: 8px !important; bottom: auto !important; left: auto !important; z-index: 3 !important; opacity: 0; visibility: hidden; transition: opacity .2s, visibility .2s; }
    html.bp-presenting.bp-bars .bp-zoom { opacity: 1; visibility: visible; }
    /* Idle hides the pointer too, the way a video player does. The * rule is needed because
       .bp-tile sets cursor: grab and Meet sets its own on plenty of elements. */
    html.bp-presenting:not(.bp-bars), html.bp-presenting:not(.bp-bars) * { cursor: none !important; }
    html.bp-presenting .bp-dock { position: fixed !important; left: var(--bp-left, 12px) !important; bottom: 20px !important; top: auto !important; }
    html.bp-presenting .bp-toprow { box-sizing: border-box !important; padding-right: var(--bp-pad, 204px) !important; }
    /* Top bar above the bottom bar (the docked groups overlap it), but click-through except its groups,
       so its full-width background doesn't cover the share's controls. */
    html.bp-presenting .bp-bar:has(.bp-dock) { z-index: 3 !important; }
    html.bp-presenting .bp-bar:has(.bp-dock), html.bp-presenting .bp-bar:has(.bp-dock) > *, html.bp-presenting .bp-toprow { pointer-events: none; }
    html.bp-presenting .bp-toprow > * { pointer-events: auto; }
    html.bp-presenting .bp-self-hidden { display: none !important; }
    html.bp-presenting:has(.bp-tile:hover) #bp-self-btn, #bp-self-btn:hover { opacity: 1 !important; }
  ` + Array.from({ length: 50 }, (_, i) => `.bp-tile[data-bp-i="${i}"] { --bp-i: ${i}; }`).join('\n');
  // ^ Slot index lives in a data attribute: Meet rewrites tiles' whole style attribute on speaker
  // changes, which wiped an inline --bp-i and stacked every tile on one spot until the next tick.
  // ponytail: 50 slots; more tiles than that overlap the last one.

  // "Hide me / Show me" pill after the last preview, visible while hovering the strip.
  const S = window.__bpSettings;
  let selfHidden = S.selfHidden;
  const selfBtn = document.createElement('button');
  selfBtn.id = 'bp-self-btn';
  Object.assign(selfBtn.style, {
    position: 'fixed', zIndex: '4', top: '8px', height: '28px', padding: '0 12px', border: '0',
    borderRadius: '14px', background: 'rgba(32,33,36,.85)', color: '#fff', font: '500 12px system-ui',
    cursor: 'pointer', opacity: '0', transition: 'opacity .2s', display: 'none',
  });
  const labelSelfBtn = () => { selfBtn.textContent = selfHidden ? 'Show me' : 'Hide me'; };
  labelSelfBtn();
  selfBtn.addEventListener('click', () => {
    selfHidden = !selfHidden;
    // Through the setter, not straight to localStorage: chrome.storage is authoritative, and a
    // direct write here would be overwritten by the bridge's mirror on the next page load.
    window.__bpSet('selfHidden', selfHidden);
    labelSelfBtn();
    tick();
  });

  // Your camera is the only video with a groupId (remote tracks have none).
  // ponytail: with your camera off the self tile has no track, so it stays visible.
  const isSelfTile = (tile) => [...tile.querySelectorAll('video')].some((v) => {
    const s = v.srcObject?.getVideoTracks?.()[0]?.getSettings();
    return s?.groupId && !s.displaySurface;
  });

  // Resize zones on every edge and corner of the strip *as a whole*, not one tile. They're
  // invisible: the resize cursor on hover is the affordance. Each straddles the outline, so it's
  // grabbable from inside or outside. Positions come from the strip's bounding box, because
  // Meet reorders the DOM by active speaker: the old handle sat on the last tile in DOM order,
  // which was often the left one, so it landed in the gap between two previews.
  const EDGE = 10;
  const zones = [
    ['n', 'ns-resize'], ['s', 'ns-resize'], ['e', 'ew-resize'], ['w', 'ew-resize'],
    ['ne', 'nesw-resize'], ['sw', 'nesw-resize'], ['nw', 'nwse-resize'], ['se', 'nwse-resize'],
  ].map(([dir, cursor]) => {
    const z = document.createElement('div');
    z.className = 'bp-edge';
    z.dataset.dir = dir;
    Object.assign(z.style, { position: 'fixed', zIndex: '4', cursor, display: 'none' });
    return z;
  });

  let h = 110, x = 8, y = 8;
  try { [x, y] = JSON.parse(localStorage.getItem('bp-strip-xy')) ?? [x, y]; } catch {}
  try { h = Number(localStorage.getItem('bp-preview-h')) || h; } catch {}

  const stripRect = () => {
    const rs = [...document.querySelectorAll('.bp-tile:not(.bp-self-hidden)')].map((t) => t.getBoundingClientRect());
    if (!rs.length) return null;
    const left = Math.min(...rs.map((r) => r.left)), top = Math.min(...rs.map((r) => r.top));
    const right = Math.max(...rs.map((r) => r.right)), bottom = Math.max(...rs.map((r) => r.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top, n: rs.length };
  };
  // Strip width at tile height th: n tiles at 16:9 plus 8px gaps, the same sum as .bp-tile's left calc.
  const widthFor = (th, n) => n * th * 16 / 9 + (n - 1) * 8;

  const placeControls = () => {
    const r = root.classList.contains('bp-presenting') && stripRect();
    for (const z of zones) {
      z.style.display = r ? 'block' : 'none';
      if (!r) continue;
      const d = z.dataset.dir, half = EDGE / 2;
      const horiz = d.includes('w') || d.includes('e'), vert = d.includes('n') || d.includes('s');
      Object.assign(z.style, {
        left: `${d.includes('w') ? r.left - half : d.includes('e') ? r.right - half : r.left + half}px`,
        top: `${d.includes('n') ? r.top - half : d.includes('s') ? r.bottom - half : r.top + half}px`,
        width: `${horiz ? EDGE : r.width - EDGE}px`,
        height: `${vert ? EDGE : r.height - EDGE}px`,
      });
    }
    selfBtn.style.left = `${r ? r.right + 12 : x}px`;
    selfBtn.style.top = `${r ? r.top : y}px`;
  };
  const setH = (value) => {
    h = Math.min(400, Math.max(50, value));
    root.style.setProperty('--bp-h', `${h}px`);
    placeControls();
  };

  // Tiles stay 16:9, so every zone scales the whole strip and pins the opposite side in place.
  for (const z of zones) {
    z.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      z.setPointerCapture(e.pointerId);
      const d = z.dataset.dir, r = stripRect(), x0 = e.clientX, y0 = e.clientY, h0 = h;
      z.onpointermove = (m) => {
        const dx = (m.clientX - x0) * (d.includes('w') ? -1 : d.includes('e') ? 1 : 0);
        const dy = (m.clientY - y0) * (d.includes('n') ? -1 : d.includes('s') ? 1 : 0);
        const fromX = (r.width + dx - (r.n - 1) * 8) * 9 / (16 * r.n); // inverse of widthFor
        const fromY = h0 + dy;
        // Corners follow whichever axis moved further.
        setH(!dx ? fromY : !dy ? fromX : Math.abs(fromX - h0) > Math.abs(fromY - h0) ? fromX : fromY);
        setXY(d.includes('w') ? r.right - widthFor(h, r.n) : r.left, d.includes('n') ? r.bottom - h : r.top);
      };
    });
    z.addEventListener('pointerup', () => {
      if (!z.onpointermove) return;
      z.onpointermove = null;
      try {
        localStorage.setItem('bp-preview-h', h);
        localStorage.setItem('bp-strip-xy', JSON.stringify([x, y]));
      } catch {}
    });
  }

  // Drag any preview to move the whole strip. The 4px threshold keeps plain clicks on tiles working.
  const setXY = (nx, ny) => {
    x = Math.min(innerWidth - 60, Math.max(0, nx));
    y = Math.min(innerHeight - 40, Math.max(0, ny));
    root.style.setProperty('--bp-x', `${x}px`);
    root.style.setProperty('--bp-y', `${y}px`);
    placeControls();
  };
  let drag = null;
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !e.target.closest?.('.bp-tile') || e.target.closest('button')) return;
    drag = { x0: e.clientX, y0: e.clientY, sx: x, sy: y, moved: false };
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    setXY(drag.sx + dx, drag.sy + dy);
  }, true);
  document.addEventListener('pointerup', () => {
    if (drag?.moved) {
      try { localStorage.setItem('bp-strip-xy', JSON.stringify([x, y])); } catch {}
      // Swallow the click that ends the drag so Meet doesn't treat it as a tile click.
      const swallow = (c) => { c.stopPropagation(); c.preventDefault(); };
      addEventListener('click', swallow, true);
      setTimeout(() => removeEventListener('click', swallow, true));
    }
    drag = null;
  }, true);

  // Your own shared screen is the only video whose track has a displaySurface. Someone else's share
  // is the tile whose controls mention it ("Pin/Unpin X's presentation…"); camera tiles never do.
  // ponytail: English aria-label, like the bars below.
  const presentationVideo = () => [...document.querySelectorAll('video')]
    .find((v) => v.srcObject?.getVideoTracks?.()[0]?.getSettings().displaySurface)
    ?? [...document.querySelector('main')?.children ?? []]
      .find((t) => t.querySelector('[aria-label*="presentation" i]'))?.querySelector('video');

  const seen = new Map(); // participant id -> first-seen order
  const tick = () => {
    if (!S.enabled) {
      root.classList.remove('bp-presenting');
      selfBtn.style.display = 'none';
      placeControls();
      return;
    }
    const presVideo = presentationVideo();
    root.classList.toggle('bp-presenting', !!presVideo);
    selfBtn.style.display = presVideo ? 'block' : 'none';
    if (!presVideo) { placeControls(); return; }
    if (!style.isConnected) document.head.append(style);
    if (!selfBtn.isConnected) document.body.append(...zones, selfBtn);

    // Meet moves the active speaker's tile to the front, so DOM order changes whenever someone
    // talks. Order by first time we saw each participant instead, so previews don't swap places.
    const main = document.querySelector('main');
    const pid = (tile) => tile.querySelector('[data-participant-id]')?.dataset.participantId;
    const tiles = [...main?.children ?? []].filter(pid);
    for (const tile of tiles) if (!seen.has(pid(tile))) seen.set(pid(tile), seen.size);
    tiles.sort((a, b) => seen.get(pid(a)) - seen.get(pid(b)));
    let i = 0;
    for (const tile of tiles) {
      const isPres = tile.contains(presVideo);
      const hide = !isPres && selfHidden && isSelfTile(tile);
      tile.classList.toggle('bp-pres', isPres);
      tile.classList.toggle('bp-tile', !isPres);
      tile.classList.toggle('bp-self-hidden', hide);
      if (!isPres && !hide && tile.dataset.bpI !== String(i)) tile.dataset.bpI = i;
      if (!isPres && !hide) i++;
    }
    setH(h);
    setXY(x, y);

    // Clip tiles at Meet's own corner radius. Meet rounds the video at a larger radius than our
    // old 8px clip, and behind it paints a square grey background and a near-square speaking glow:
    // both showed in the corners as a faint rectangle, the glow only while someone talks. Read the
    // radius from the tile's full-size rounded layer, because Meet has changed it (24px in Oct).
    const probe = document.querySelector('.bp-tile:not(.bp-self-hidden)');
    if (probe) {
      const w = probe.getBoundingClientRect().width;
      const layer = [...probe.querySelectorAll('*')].find((e) =>
        parseFloat(getComputedStyle(e).borderTopLeftRadius) > 0 && Math.abs(e.getBoundingClientRect().width - w) < 1);
      if (layer) root.style.setProperty('--bp-r', getComputedStyle(layer).borderTopLeftRadius);
    }

    // ponytail: English aria-labels; other UI languages need their own labels here.
    for (const sel of ['[aria-label*="Leave call" i]', '[aria-label="Meeting details"]']) {
      let bar = document.querySelector(sel);
      while (bar && getComputedStyle(bar).position !== 'absolute') bar = bar.parentElement;
      // Never hide a container that holds the call itself: that faded the whole page to white.
      bar?.classList.toggle('bp-bar', !bar.contains(main));
    }
    // Meet's top bar puts the meeting details (time | code) over the preview strip and the
    // people/Gemini group over the share's controls. Dock both in the bottom bar's empty left side,
    // and pad the top row so the "Stop presenting" pill stays clear of the controls (~190px wide).
    const details = document.querySelector('[aria-label="Meeting details"]');
    const people = document.querySelector('[aria-label="Call feature notifications and actions"]');
    let d = details;
    while (d?.parentElement && !d.parentElement.contains(people)) d = d.parentElement;
    let p = people;
    while (p && p.parentElement !== d?.parentElement) p = p.parentElement;
    if (d && p) {
      d.classList.toggle('bp-dock', true);
      p.classList.toggle('bp-dock', true);
      d.parentElement.classList.toggle('bp-toprow', true);
      p.style.setProperty('--bp-left', `${d.getBoundingClientRect().right + 8}px`);
    }
    // The share's own controls sit bottom-right, under the bottom bar: "Enter full screen" for a
    // window/screen share, the Zoom in/out pill for a tab share. Pin their container top-right.
    let zoom = document.querySelector('.bp-pres :is([aria-label$="full screen"], [aria-label="Zoom in"])');
    while (zoom && getComputedStyle(zoom).position !== 'absolute') zoom = zoom.parentElement;
    // toggle, not add: add rewrites the attribute even when present, which re-fires the observer below.
    if (zoom?.closest('.bp-pres')) zoom.classList.toggle('bp-zoom', true);
    // Reserve the pill's real width in the top row (a remote share's pill has extra buttons), so the
    // "X (Presenting)" pill never covers it. Keep the last width while the pill is hidden (0 wide).
    const pillW = zoom?.closest('.bp-pres') ? zoom.getBoundingClientRect().width : 0;
    if (pillW) root.style.setProperty('--bp-pad', `${pillW + 16}px`);
    placeControls();
  };

  // Bars show while the cursor moves and hide after 2s of stillness (invisible and click-through
  // otherwise). They stay up while the cursor rests on a bar, so they don't vanish mid-click.
  let idle;
  document.addEventListener('mousemove', (e) => {
    root.classList.add('bp-bars');
    clearTimeout(idle);
    const overBar = [...document.querySelectorAll('.bp-bar, .bp-dock, .bp-zoom, .bp-edge')].some((b) => {
      const r = b.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    if (!overBar && !S.barsPinned) idle = setTimeout(() => root.classList.remove('bp-bars'), 2000);
  }, true);
  root.addEventListener('mouseleave', () => {
    if (S.barsPinned) return;
    clearTimeout(idle);
    root.classList.remove('bp-bars');
  });

  window.__bpOnSettings(() => {
    selfHidden = S.selfHidden;
    labelSelfBtn();
    if (S.barsPinned) { clearTimeout(idle); root.classList.add('bp-bars'); }
    tick();
  });

  // The popup's "Reset" button, relayed by bridge.js. Restores this file's own defaults.
  window.addEventListener('bp-reset-strip', () => {
    try {
      localStorage.removeItem('bp-strip-xy');
      localStorage.removeItem('bp-preview-h');
    } catch {}
    setH(110);
    setXY(8, 8);
    tick();
  });

  setInterval(tick, 500);

  // On every speaker/mute change Meet rewrites each tile's whole class attribute, wiping our classes,
  // and the tile snaps back into Meet's own layout until the next tick. Re-tag right away instead:
  // observer callbacks run before the next paint, so the un-tagged state is never drawn.
  const observer = new MutationObserver((records) => {
    // Only main's own children (the tiles) and the zoom pill matter; skip Meet's constant inner churn.
    if (records.some((r) => r.target.tagName === 'MAIN' || r.target.parentElement?.tagName === 'MAIN'
      || (r.type === 'attributes' && r.oldValue?.includes('bp-zoom')))) tick();
  });
  let observedMain = null;
  setInterval(() => {
    const main = document.querySelector('main');
    if (main === observedMain) return;
    observer.disconnect();
    if (main) observer.observe(main, { childList: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true, subtree: true });
    observedMain = main;
  }, 500);
})();
