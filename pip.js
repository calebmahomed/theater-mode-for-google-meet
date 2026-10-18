(() => {
  // Initial PiP window size. You can still resize it by dragging.
  const WIDTH = 480;
  const HEIGHT = 270;

  const S = window.__bpSettings;
  const pipOn = () => S.enabled && S.pip;

  // Track every peer connection so we know which video tracks are remote.
  // Self camera and screen-share preview are local tracks, so they never match.
  const pcs = new Set();
  const PC = window.RTCPeerConnection;
  window.RTCPeerConnection = class extends PC {
    constructor(...args) {
      super(...args);
      pcs.add(this);
    }
  };

  // Remote video tracks with frames actually arriving. Meet leaves stale receiver tracks
  // bound to tiles (e.g. while you present); those are "live" but render black.
  // A track counts as live if frames arrived in the last 3s. Low-fps or static feeds (screen
  // shares, frozen cameras) skip polls, and a strict per-poll check made the overlay flicker.
  const lastFrames = new Map();
  const lastProgress = new Map();
  const remoteTrackIds = async () => {
    const ids = new Set();
    const now = Date.now();
    for (const pc of [...pcs]) {
      if (pc.connectionState === 'closed') { pcs.delete(pc); continue; }
      (await pc.getStats()).forEach((s) => {
        if (s.type !== 'inbound-rtp' || s.kind !== 'video') return;
        const id = s.trackIdentifier;
        const frames = s.framesDecoded ?? 0;
        if (frames > (lastFrames.get(id) ?? 0)) lastProgress.set(id, now);
        lastFrames.set(id, frames);
        if (now - (lastProgress.get(id) ?? 0) < 3000) ids.add(id);
      });
    }
    return ids;
  };

  // Remote tracks Meet is currently showing (in the tab or the PiP window), camera on.
  const shownRemoteTracks = async (docs, overlay) => {
    const ids = await remoteTrackIds();
    const tracks = new Map();
    for (const doc of docs) {
      for (const v of doc.querySelectorAll('video')) {
        if (overlay.contains(v)) continue;
        for (const t of v.srcObject?.getVideoTracks?.() ?? []) {
          if (ids.has(t.id) && t.readyState === 'live' && !t.muted) tracks.set(t.id, t);
        }
      }
    }
    return [...tracks.values()];
  };

  const setup = (pip) => {
    const doc = pip.document;
    const overlay = doc.createElement('div');
    // Inline styles only: Meet's CSP / Trusted Types can block <style> and innerHTML.
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '2147483647', background: '#000',
      display: 'none', gap: '2px', transition: 'opacity .15s',
    });

    // Hover reveals Meet's own PiP UI (controls); leaving shows only the video again.
    doc.documentElement.addEventListener('mouseenter', () => {
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
    });
    doc.documentElement.addEventListener('mouseleave', () => {
      overlay.style.opacity = '1';
      overlay.style.pointerEvents = 'auto';
    });

    const sync = async () => {
      if (!overlay.isConnected) doc.body?.append(overlay);
      const tracks = await shownRemoteTracks([document, doc], overlay);
      // Someone is presenting (Meet shows its zoom controls): keep Meet's UI so the share and
      // its full-screen button stay visible. Our overlay would crop the share with object-fit: cover.
      // ponytail: English aria-label, like layout.js; other UI languages need their own label.
      const presenting = [document, doc].some((d) => d.querySelector('[aria-label="Presentation"], [aria-label*="zoom in" i]'));
      // No remote video (cameras off, or detection failed): fall back to Meet's UI.
      overlay.style.display = tracks.length && !presenting ? 'flex' : 'none';

      const ids = new Set(tracks.map((t) => t.id));
      for (const v of [...overlay.children]) if (!ids.has(v.dataset.id)) v.remove();
      const have = new Set([...overlay.children].map((v) => v.dataset.id));
      for (const t of tracks) {
        if (have.has(t.id)) continue;
        const v = doc.createElement('video');
        v.dataset.id = t.id;
        v.autoplay = v.muted = v.playsInline = true; // audio still plays from Meet
        v.srcObject = new MediaStream([t]);
        // contain, not cover: a screen share cropped to its centre was just a white page.
        Object.assign(v.style, { flex: '1', minWidth: '0', height: '100%', objectFit: 'contain' });
        overlay.append(v);
      }
    };

    sync();
    // PiP window is visible, so its timers aren't background-throttled. Dies with the window.
    pip.setInterval(sync, 500);
  };

  // Option+P (Alt+P): native video PiP. Borderless, rounded corners, controls only on hover,
  // window locks to the video's aspect ratio. Shows one person: Meet's largest remote tile
  // (the active speaker / spotlight), re-checked every second.
  // ponytail: one video only; multi-person grid needs canvas compositing, add if needed.
  const native = document.createElement('video');
  native.autoplay = native.muted = native.playsInline = true;
  let timer;
  let inNativePip = false;
  native.addEventListener('enterpictureinpicture', () => { inNativePip = true; });
  native.addEventListener('leavepictureinpicture', () => { inNativePip = false; });

  // Meet treats any PiP video as its own and switches to a minimal layout on the next speaker
  // change, dropping remote tiles and their video (our PiP goes black). Hide ours from Meet.
  const pipElement = Object.getOwnPropertyDescriptor(Document.prototype, 'pictureInPictureElement');
  Object.defineProperty(Document.prototype, 'pictureInPictureElement', {
    configurable: true,
    get() {
      const el = pipElement.get.call(this);
      return el === native ? null : el;
    },
  });

  const showLargestRemote = async () => {
    const ids = await remoteTrackIds();
    let best, bestArea = -1;
    for (const v of document.querySelectorAll('video')) {
      const area = v.offsetWidth * v.offsetHeight;
      for (const t of v.srcObject?.getVideoTracks?.() ?? []) {
        if (ids.has(t.id) && t.readyState === 'live' && !t.muted && area > bestArea) {
          best = t;
          bestArea = area;
        }
      }
    }
    if (best && native.srcObject?.getVideoTracks()[0] !== best) native.srcObject = new MediaStream([best]);
    return best;
  };

  document.addEventListener('keydown', async (e) => {
    if (!e.altKey || e.code !== 'KeyP') return;
    // Before preventDefault: with the feature off the keystroke belongs to the page.
    if (!pipOn()) return;
    e.preventDefault();
    e.stopPropagation();
    if (inNativePip) return document.exitPictureInPicture();
    if (!(await showLargestRemote())) return;
    await native.play();
    await native.requestPictureInPicture();
    clearInterval(timer);
    timer = setInterval(showLargestRemote, 1000);
  }, true);
  native.addEventListener('leavepictureinpicture', () => clearInterval(timer));

  // While our PiP is up, tell Meet the tab is visible so it keeps pulling remote video when
  // you switch away. ponytail: unverified whether Meet needs this; the PiP-hiding above was the fix.
  for (const [prop, value] of [['hidden', false], ['visibilityState', 'visible']]) {
    const { get } = Object.getOwnPropertyDescriptor(Document.prototype, prop);
    Object.defineProperty(Document.prototype, prop, {
      configurable: true,
      get() { return inNativePip ? value : get.call(this); },
    });
  }
  window.addEventListener('visibilitychange', (e) => {
    if (e.isTrusted && inNativePip) e.stopImmediatePropagation();
  }, true);
  const announce = () => document.dispatchEvent(new Event('visibilitychange'));
  native.addEventListener('enterpictureinpicture', announce);
  native.addEventListener('leavepictureinpicture', announce);

  const proto = window.DocumentPictureInPicture?.prototype;
  if (!proto) return;
  const requestWindow = proto.requestWindow;
  proto.requestWindow = async function (opts = {}) {
    // Checked per call, not once at load, so the toggle works without a reload. Off means
    // Meet's own PiP window, its own size: forcing 480x270 is visible, so it has to be gated
    // too, or "off" would still change what Meet does.
    if (!pipOn()) return requestWindow.call(this, opts);
    const pip = await requestWindow.call(this, { ...opts, width: WIDTH, height: HEIGHT });
    setup(pip);
    return pip;
  };
})();
