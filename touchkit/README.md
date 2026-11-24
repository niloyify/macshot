# 👀 TouchKit

**All your everyday tools in one simple app, on every device:** Windows, Mac, Linux, iPhone, Android and the web. **One account** keeps your notes, to-dos, time tracking and invoices in sync everywhere.

- **Website / phones**: open TouchKit in any browser. On iPhone or Android, tap *Share → Add to Home Screen* and it works like an app, even offline.
- **Desktop app** (Windows, Mac, Linux): everything above, plus tools that control the computer, like the phone remote, the on-screen Touch Bar, window snap and clipboard history.

## Tools (30+)

| Group | Tools |
|---|---|
| Account | Log in / sign up · sync on all devices · log out (one device or all) · delete account |
| Work | Quick Notes · To-do · Focus Timer · World Clock · Clipboard History* |
| Freelance | Time Tracker (CSV) · Invoice Maker (PDF) · Rate Calculator |
| Calculate | Calculator · Currency Converter (live rates) · Percentage · Date & Age · Loan & EMI |
| Text & Data | Text Tools · Password Generator · QR Code Maker · JSON · Encode / Decode · Unit Converter (incl. bigha, katha, decimal, maund) |
| Media | Image Resizer · Images to PDF · Voice Recorder · Read Aloud (Bangla too) · Voice Typing (বাংলা, English…) |
| Capture | Screenshot & Screen Recording · Camera · Color Picker |
| Control | Phone Remote* · On-screen Touch Bar* · Window Snap* · Keep Awake |

\* Desktop app only, because a website is not allowed to control the computer.

Everything runs on your device. With an account, your tool data is also stored on the TouchKit server so it can sync.

## Run the website and account server

```bash
docker compose -f server/docker-compose.yml up -d --build
```

This opens TouchKit at http://localhost:8080, with accounts and sync. Data lives in the `touchkit-data` volume. Put it behind HTTPS (Caddy, nginx or a host such as Render or Fly.io) to use it from phones. The server has no dependencies: Node 22 with the built-in `node:sqlite`.

API: `POST /api/register`, `POST /api/login`, `POST /api/logout`, `POST /api/logout-all`, `GET /api/me`, `GET /api/data?since=`, `PUT /api/data`, `POST /api/delete-account`. Passwords are hashed with scrypt, sessions are random tokens (only their hash is stored), and login attempts are rate limited.

The desktop app talks to the server set in `web/config.js` (`server`), or the one entered under *Account → Server*.

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

How it fits together:

- `web/` is the app itself. The website, the phones and the desktop app all use it. The tools are in `web/tools.js`, accounts and sync in `web/account.js`, and `web/platform.js` swaps native features for browser ones on the web.
- `server/` is the account and sync server, which also serves `web/`.
- `src/` is the desktop app (Electron): tray, shortcuts, screenshots, recording, the phone remote (`remote.js`, `phone/`) and the Touch Bar. Mouse, keys and windows are controlled through `native/mac/input.swift` (macOS), `native/win/input.ps1` (Windows) or xdotool (Linux).

## License

MIT
