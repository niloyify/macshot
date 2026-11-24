# 👀 TouchKit

**Everything you need to use your computer easily, in one app.** Windows, macOS and Linux, with a phone remote that works in any phone browser.

Made for people whose laptop has no touch screen, or whose Touch Bar broke, and for freelancers who juggle ten small tools a day.

## Highlights

- **📱 Phone Remote**: scan a QR code and your phone becomes a **touchpad, Touch Bar and keyboard** (voice typing works too). No app to install. A 6-digit code protects it, and it only works on your own Wi‑Fi.
- **🎛 On-screen Touch Bar**: volume, brightness, music, window layouts and screenshots in a bar that floats at the bottom of the screen and never steals focus.
- **🪟 Window Snap**: put a window on the left or right half, or full screen, with one shortcut.

## All tools

| Group | Tools |
|---|---|
| Control | Phone Remote · Touch Bar · Window Snap · Keep Awake |
| Capture | Screenshot & Screen Recording (with mic) · Camera photo · Color Picker |
| Work | Clipboard History · Quick Notes · To-do · Focus Timer (Pomodoro) · World Clock |
| Freelance | Time Tracker (CSV export) · Invoice Maker (PDF) · Rate Calculator |
| Text & Data | Text Tools (word count, case, clean-up) · Password Generator · QR Code Maker (links, Wi‑Fi) · JSON formatter · Base64 / URL encode · Unit Converter (incl. bigha, katha, decimal, maund) |
| Images | Image Resizer / Compressor / Converter (JPG, PNG, WebP) |

Everything runs on your computer. Nothing is uploaded.

## Shortcuts

| Keys | Action |
|---|---|
| Alt+Shift+Space | Open TouchKit |
| Alt+Shift+1 | Screenshot (saved to Pictures/TouchKit and copied) |
| Alt+Shift+5 | Start / stop screen recording |
| Alt+Shift+T | Show / hide the on-screen Touch Bar |
| Alt+Shift+V | Clipboard history |
| Alt+Shift+← / → / ↑ | Window to left half / right half / full screen |

On a Mac, Alt is the Option key.

## Download

See [Releases](https://github.com/niloyify/macshot/releases) (tags `touchkit-v*`):

- **Windows**: `TouchKit-Setup-*.exe`, or `TouchKit-Portable-*.exe` (no install needed)
- **macOS**: `TouchKit-mac.zip`. Unzip it and move TouchKit to Applications. The first time, right-click → Open. Then allow TouchKit under System Settings → Privacy & Security → **Accessibility** (for the phone remote, Touch Bar and window snap) and **Screen Recording** (for screenshots).
- **Linux**: `.AppImage` or `.deb`. Install `xdotool` for the phone remote and Touch Bar keys.

## Develop

```bash
npm install
npm start
```

On macOS, build the input helper first:

```bash
swiftc -O native/mac/input.swift -o native/mac/input
```

`npm start -- --test` takes a screenshot and a 4-second recording, then quits. `--bar` opens the Touch Bar at start and `--hidden` starts in the tray only.

How it fits together: `src/main.js` holds the tray, shortcuts and windows. `src/input.js` controls the mouse, keys and windows through `native/mac/input.swift` (macOS), `native/win/input.ps1` (Windows) or xdotool (Linux). `src/remote.js` is the phone server, and `src/phone/` is the phone web app. The tools live in `src/hub/tools.js`.

## License

MIT
