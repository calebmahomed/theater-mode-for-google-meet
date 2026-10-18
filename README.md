# Theater Mode for Google Meet

A Chrome extension that turns Google Meet into a watch-together view whenever someone shares their screen.

- **Full-window share.** Your share or anyone else's fills the window.
- **Movable previews.** Camera tiles sit in a strip you can drag anywhere and resize from the corner. "Hide me" hides your own tile.
- **Out-of-the-way controls.**
  - Meet's bars appear when you move the mouse and fade after 2 seconds.
  - The share's zoom and full-screen controls move to the top right, clear of the bars.
- **Better picture-in-picture.**
  - Meet's PiP window becomes a 16:9, video-only view of the other cameras.
  - Alt+P (or Option+P) opens native picture-in-picture of the main speaker.
- **Settings in the toolbar.** Click the extension icon for a master on/off switch, toggles
  for picture-in-picture, hiding your own tile and keeping Meet's controls visible, and a
  button to bring the preview strip back if you drag it off screen.

Not affiliated with Google.

## Install

Not on the Chrome Web Store yet, so you install it by hand. It takes a minute.

1. Click the green **Code** button at the top of this page, then **Download ZIP**.
2. **Unzip it.** Chrome can't load the `.zip` itself, only the folder inside it.
3. Put the unzipped folder somewhere you'll keep it, like your Documents folder. Chrome loads
   the extension from this folder every time it starts, so moving or deleting it later breaks
   the extension.
4. Open `chrome://extensions`. In Arc, the page is `arc://extensions`.
5. Turn on **Developer mode** with the switch in the top right.
6. Click **Load unpacked** and pick the folder you unzipped.

The icon appears in your toolbar. Open a Meet call and share a screen to see it work.

### Updating

Download the ZIP again, replace the contents of the same folder, then press the reload icon on
the extension's card at `chrome://extensions`. Refresh any open Meet tabs.

### Developing

There's no build step. Edit the files, reload the extension, refresh Meet.
`node test-settings.mjs` checks how settings defaults resolve; everything else is verified in
a live call.

## Limitations

- Only works with Meet in English, because elements are found by their English `aria-label`s.
- Meet's markup changes often, so expect breakage. Fixes are welcome.
