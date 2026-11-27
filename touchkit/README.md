# 👀 TouchKit

**TouchKit 3.0 is one app with everything from TouchKit and MacShot.** On the computer it lives in the tray / menu bar as a pair of eyes (red while recording) and has all the screen tools of MacShot: area and full-screen screenshots, copy text from the screen, annotate, colour picker, screen recording and sound-only recording.

**All your everyday tools in one simple app, on every device:** Windows, Mac, Linux, iPhone, Android and the web. **One account** keeps your notes, to-dos, time tracking and invoices in sync everywhere.

- **Website / iPhone**: open https://niloyify.github.io/macshot/ in any browser. On iPhone or iPad, tap *Share → Add to Home Screen* in Safari and it works like an app, even offline (an App Store app needs an Apple developer account).
- **Android**: the TouchKit APK (camera photo and video, voice, notifications, files) — or add the website to the home screen.
- **Desktop app** (Windows, Mac, Linux): everything above, plus tools that control the computer, like the phone remote, the on-screen Touch Bar, window snap and clipboard history.

## Tools (127)

| Group | Tools |
|---|---|
| Account | Log in / sign up · sync on all devices · log out (one device or all) · delete account |
| Work | Quick Notes · To-do · Focus Timer · World Clock · Clipboard History* |
| Freelance | Time Tracker (CSV) · Invoice Maker (PDF) · Rate Calculator |
| Calculate | Calculator · Currency Converter (live rates) · Percentage · Date & Age · Loan & EMI |
| Text & Data | Text Tools · Password Generator · QR Code Maker · JSON · Encode / Decode · Unit Converter (incl. bigha, katha, decimal, maund) |
| Media | Image Resizer · Images to PDF · Voice Recorder · Read Aloud (Bangla too) · Voice Typing (বাংলা, English…) |
| Capture | Screenshot (area / full screen) · Annotate · Copy text from screen · Screen & Sound Recording · Camera (photo + video) · Color Picker |
| Control | Phone Remote* · On-screen Touch Bar* · Window Snap* · Keep Awake |
| Money | Income Tax BD · Zakat · Mobile Banking Fee · FD / DPS · Sanchayapatra · Compound Interest · Inflation · Savings Goal · Budget Planner · Split Bill · Salary Breakdown · Credit Card Payoff · Selling Price & Profit · VAT · Break-even · Rent vs Buy · Electricity Bill · Gold Price · Inheritance (Faraid) · Provident Fund & Gratuity · Subscription Tracker · Unit Price Compare |
| Health | BMI & Ideal Weight · Daily Calories · Water Intake · Pregnancy Due Date · Period & Ovulation · Baby Vaccine Schedule · Child Growth Check · Blood Pressure Log · Blood Sugar Log · Medicine Reminder · Sleep Cycle · Blood Donation · Heart Rate Zones · First Aid Guide |
| Study & Job | GPA / CGPA · Job Age Check · Exam Countdown & Plan · CV Maker · Application Writer · Typing Speed Test · Flashcards · Equation Solver · Formula Solver · Taka in Words · Reading Time & Readability |
| Faith & Calendar | Prayer Times & Qibla · Sehri & Iftar Times · Bangla Calendar · Hijri Date · Time Zone Meeting Planner · Document Expiry Reminder |
| Home & Land | Land Area from Sides · Construction Cost · Brick Counter · Paint Needed · Tiles Counter · AC Size · IPS / Solar Sizing · Electric Load & Wiring · Water Tank Size · Shifting Checklist |
| Farming | Fertilizer Dose · Seed Rate · Mushroom Batch Planner · Fish Pond Stocking · Poultry Feed & Profit · Crop Calendar · Farm Profit Tracker |
| Shop | Due Book (বাকির খাতা) · Cash Book · Stock / Inventory · Quotation Maker · Money Receipt · Staff Attendance & Salary · Price List Maker |
| Safety & Files | Password Strength Check · Scam Link Checker · Photo Privacy · File Checksum · Internet Speed Test · Data Pack Compare · PDF Merge & Split · PDF Compress · Photo to Text (OCR, Bangla + English) · Background Remover · WiFi QR · Email Writer · Emergency Numbers & SOS |
| Daily Life | Trip Cost · Recipe Scaler · Clothes & Shoe Sizes · Birthdays & Anniversaries · Event Countdown |

\* Desktop app only, because a website is not allowed to control the computer.

Big libraries (PDF, OCR) load only when their tool opens. OCR downloads the language data once, then works offline.

**Android app:** `android/build.sh` builds a signed APK with Docker (no Android Studio needed). The signing key lives outside the repo in `~/.touchkit-android`; keep a safe copy, every update must be signed with the same key.

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
| Alt+Shift+Space or M | Open TouchKit (all tools) |
| Alt+Shift+1 | Capture an area (drag a rectangle, Esc cancels) |
| Alt+Shift+2 | Copy text from the screen (OCR, Bangla + English) |
| Alt+Shift+3 | Capture the full screen |
| Alt+Shift+4 | Capture and annotate (arrow, box, pen, highlight, text, steps, blur) |
| Alt+Shift+5 | Start / stop screen recording |
| Alt+Shift+6 | Start / stop sound recording (microphone only) |
| Alt+Shift+C | Pick a colour from the screen |
| Alt+Shift+V | Clipboard history |
| Alt+Shift+N | Quick notes |
| Alt+Shift+T | Timer and stopwatch |
| Alt+Shift+Q | QR code |
| Alt+Shift+B | Show / hide the on-screen Touch Bar |
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

`npm start -- --test` checks the screen tools (full and area screenshot, colour picker, annotate), the OCR and PDF tools inside the app, a 4-second screen recording and a 4-second sound recording, then quits. `--bar` opens the Touch Bar at start and `--hidden` starts in the tray only.

How it fits together:

- `web/` is the app itself. The website, the phones and the desktop app all use it. The tools are in `web/tools.js`, accounts and sync in `web/account.js`, and `web/platform.js` swaps native features for browser ones on the web.
- `server/` is the account and sync server, which also serves `web/`.
- `src/` is the desktop app (Electron): tray, shortcuts, screenshots, recording, the phone remote (`remote.js`, `phone/`) and the Touch Bar. Mouse, keys and windows are controlled through `native/mac/input.swift` (macOS), `native/win/input.ps1` (Windows) or xdotool (Linux).

## License

MIT
