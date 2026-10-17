# Theater Mode for Google Meet

A Chrome extension that turns Google Meet into a watch-together view whenever someone shares their screen.

- **Full-window share.** Your share or anyone else's fills the window.
- **Movable previews.** Camera tiles sit in a strip you can drag anywhere and resize from the corner. "Hide me" hides your own tile.
- **Out-of-the-way controls.**
  - Meet's bars appear when you move the mouse and fade after 2 seconds.
  - The share's zoom and full-screen controls move to the top right, clear of the bars.
- **Better picture-in-picture.**
  - Meet's PiP window becomes a 16:9, video-only view of the other cameras.
  - Alt+P opens native picture-in-picture of the main speaker.

Not affiliated with Google.

## Install

1. Download or clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode**. In Arc, the page is `arc://extensions`.
3. Click **Load unpacked** and select the repo folder.

There's no build step. After you change the code, reload the extension and refresh Meet.

## Limitations

- Only works with Meet in English, because elements are found by their English `aria-label`s.
- Meet's markup changes often, so expect breakage. Fixes are welcome.
