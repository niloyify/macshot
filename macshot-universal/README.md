# MacShot for Windows, macOS and Linux

The same MacShot, now on every computer, with the everyday tools you need in one app. It lives in the system tray (menu bar on macOS) as a pair of eyes that turns red while recording.

| Shortcut | What it does |
| --- | --- |
| Alt+Shift+1 | **Capture Area**: drag a rectangle, Esc cancels |
| Alt+Shift+3 | **Capture Full Screen** (the screen under the mouse pointer) |
| Alt+Shift+5 | **Start / Stop Recording** the screen with your microphone (and the computer's sound on Windows) |
| Alt+Shift+6 | **Start / Stop Sound Recording**: only the sound around you, from the microphone |
| Alt+Shift+2 | **Copy Text from Screen** (OCR): drag over any text, it is read and copied. English and Bangla |
| Alt+Shift+4 | **Capture and Annotate**: arrows, boxes, pen, highlighter, text, numbered steps and blur, then Save or Copy |
| Alt+Shift+C | **Pick Colour from Screen**: magnifier, click copies `#RRGGBB` (HEX, RGB and HSL kept in Colours) |
| Alt+Shift+V | **Clipboard History**: last 100 texts and 20 pictures, search, pin, copy again |
| Alt+Shift+N | **Quick Notes**: saved by themselves |
| Alt+Shift+T | **Timer and Stopwatch**: presets, laps, a sound and a notification when time is up |
| Alt+Shift+Q | **QR Code**: from any text or link (filled from the clipboard), Wi-Fi QR, copy or save PNG |
| Alt+Shift+M | **All Tools** window (also has the **Image Converter**: PNG / JPG / WebP, smaller sizes, many files at once) |

Screenshots are saved as PNG in `Pictures/MacShot` and copied to the clipboard. Recordings go to `Videos/MacShot` (`Movies/MacShot` on macOS): screen as MP4, sound as M4A. The tray menu has every tool, opens both folders and can start MacShot at login (Windows and macOS). Converted pictures go to `Pictures/MacShot/Converted`. Reading text downloads the language data once (needs the internet the first time).

## Download

Get the file for your computer from the [releases page](https://github.com/niloyify/macshot/releases) (look for **MacShot macshot-v…**):

- **Windows:** `MacShot-Setup-….exe` installs it; `MacShot-Portable-….exe` runs without installing. If Windows says "Windows protected your PC", click **More info → Run anyway**.
- **macOS:** `MacShot-mac-universal.zip`. Unzip, move **MacShot** to Applications, open it with right-click → **Open** the first time, then allow it under System Settings → Privacy & Security → Screen & System Audio Recording and Microphone.
- **Linux:** `MacShot-….AppImage` (`chmod +x`, then open it) or the `.deb` package (`sudo apt install ./MacShot….deb`). Needs a desktop with a system tray.

## Build it yourself

Needs Node.js 22.

```bash
cd macshot-universal
npm install
npm start          # run it
npm run dist       # build installers for this OS into dist/
```

`MacShot --test` checks every feature (screenshots, clipboard history, colour picker, annotate, QR, text reading, converter, notes, timer, stopwatch, 4 s of screen and 4 s of sound recording), prints the results and quits (used to check a build).

> **MacShot is now part of Jhuli (formerly TouchKit).** Every MacShot feature (screenshots, area, OCR, annotate, colour picker, screen and sound recording, clipboard history, notes, timer, QR, image converter) is inside the Jhuli app, together with 120+ other tools. Get it from the [releases page](https://github.com/niloyify/macshot/releases?q=jhuli). This folder stays for MacShot 2.1.
