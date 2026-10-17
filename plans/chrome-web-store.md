# Chrome Web Store launch plan

Status: plan only (2026-10-17). Contributions welcome.

Store specs below are from memory. Check them against the current Chrome Web Store developer docs before producing assets.

## 1. Account and policy
- Register a Chrome Web Store developer account. There's a one-time ~$5 fee and 2-step verification is required.
- Name: "Theater Mode for Google Meet". "for Google Meet" is the allowed way to name a third-party add-on.
- Don't use the Meet logo, Google colours as a logo, or "Google" as the brand.
- Add "Not affiliated with Google" to the description (the README already says it).
- Single purpose statement: "Improves Google Meet's layout for screen sharing: full-window shares, movable camera previews and a video-only picture-in-picture."

## 2. Code changes before submitting
- [ ] Icons: 16, 32, 48 and 128 px PNGs, plus an `icons` field in `manifest.json`.
- [ ] Bump `version` to `1.0.0`.
- [ ] Test in plain Chrome, not just Arc: a fresh profile, presenting a tab, a window and a full screen, a remote share, and PiP.
- [ ] Release zip: `manifest.json`, `pip.js`, `layout.js`, icons. Leave out `CONTEXT.md`, `README.md`, `plans/` and `.git`. A one-line `zip` command is enough; no build tool.
- [ ] Permissions: none beyond the `meet.google.com` content-script match. No remote code and no network requests. Mention this in the review notes; it speeds up review.

## 3. Privacy tab
- Data collected: none.
  - Preferences (strip size and position, hide-me) stay in `localStorage` on the user's machine.
  - Nothing is sent anywhere.
- Host permission justification: "Runs only on meet.google.com to rearrange the call layout."
- Privacy policy: probably optional when nothing is collected, but add a short one anyway. Host it as `PRIVACY.md` in the repo once shipped.

## 4. Branding
- Icon concept: a wide screen with a row of three small round heads along its top edge. That's the product in one glyph, and it's distinct from Meet's camera icon.
  - Shape: flat, a single accent colour on a dark rounded square.
  - Must still read at 16px: test it in the toolbar.
- Palette: Meet already uses a near-black UI.
  - Base: charcoal `#1f1f1f`.
  - Accent: one warm colour (marquee amber `#f5b942`, "theater lights") so it stands out from Google blue.
  - Text: white.
- Tagline options:
  - "Screen shares, front and centre."
  - "Watch together in Google Meet."
  - "Make the share the show."
- Summary (≤132 chars): "Screen shares fill your Meet window. Drag and resize camera previews, auto-hiding controls, video-only picture-in-picture."

## 5. Store graphics
| Asset | Size | Required | Content |
|---|---|---|---|
| Store icon | 128×128 (96×96 art, 16px padding) | yes | the icon above |
| Screenshots | 1280×800, 1 to 5 | at least 1 | see shot list |
| Small promo tile | 440×280 | yes | icon, name and tagline on charcoal |
| Marquee | 1400×560 | no (needed for featuring) | hero shot of a share with the strip, plus the tagline |

Shot list (1280×800, each with a short caption bar on top):
1. **Watch together.** A remote share (a video or slides) fills the window, with the camera strip along the top.
2. **Move and resize previews.** The strip dragged to a corner, with the resize handle visible.
3. **Controls when you need them.** Bars visible mid-fade; zoom and full-screen top right; time, code and Gemini bottom-left.
4. **Presenting.** Your own share fills the window, and "Hide me" is shown.
5. **Picture-in-picture.** The 16:9 video-only PiP window floating over another app.

Capture notes:
- Use test accounts or friends who agree to be shown. Real people's faces and names need consent, so never use strangers.
- Don't show real meeting codes. Blur them or use a throwaway meeting.
- Share neutral content: a public-domain video or your own slides, nothing copyrighted.
- Capture at 2560×1600 (Retina) and downscale to 1280×800 for sharpness. Frame the captions in Figma or a simple HTML template.

## 6. Listing copy
- Description: three short paragraphs.
  1. What it does.
  2. A feature bullet list (mirror the README).
  3. Limitations: English UI only, and Meet changes may break it. Link to the GitHub repo for issues.
- Category: Communication (or Productivity).
- Language: English.

## 7. Submit
- [ ] Upload the zip and fill in the listing, privacy and distribution tabs (public, all regions).
- [ ] Review notes for the reviewer: how to test. Join a Meet call with two accounts, share a tab, and see the layout.
- [ ] Review usually takes a few days. After approval, tag `v1.0.0` on GitHub with release notes.

## Open questions
- Icon: design it yourself, have me draft SVGs to iterate on, or hire someone?
- Who appears in the screenshots? This needs a second consenting participant.
- Do the preview-strip restyle before launch? It's what screenshot 2 shows, so ideally yes.
