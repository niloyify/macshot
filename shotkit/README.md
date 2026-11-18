# ShotKit

Screenshots and screen recording for **Windows, macOS and Linux**, from the system tray (menu bar on macOS). The tray icon is the same pair of 👀 eyes as MacShot; it turns red while recording.

- **Capture Screen** — Alt+Shift+1: saves a PNG of the screen under the mouse pointer to `Pictures/ShotKit` and copies it to the clipboard.
- **Start / Stop Recording** — Alt+Shift+5: records the screen with your microphone (and, on Windows, the computer's sound) to `Videos/ShotKit` (`Movies/ShotKit` on macOS) as MP4.
- **Open Screenshots Folder**, **Open Recordings Folder**, **Quit ShotKit**.

## Download

Get the file for your computer from the [releases page](https://github.com/niloyify/macshot/releases) (look for **ShotKit**):

- **Windows:** `ShotKit-Setup-….exe` installs it; `ShotKit-Portable-….exe` runs without installing. Windows may show "Windows protected your PC": click **More info → Run anyway**.
- **macOS:** `ShotKit-mac.zip`. Unzip, move **ShotKit** to Applications, then open it with right-click → **Open** the first time. Allow it under System Settings → Privacy & Security → Screen & System Audio Recording and Microphone.
- **Linux:** `ShotKit-….AppImage` (run `chmod +x` on it, then open it) or the `.deb` package (`sudo apt install ./ShotKit….deb`). Needs a desktop with a system tray.

The computer's own sound (music, videos) is recorded on Windows only; on macOS and Linux the recording has your microphone.

## Build it yourself

Needs Node.js 22.

```bash
cd shotkit
npm install
npm start          # run it
npm run dist       # build installers for this OS into dist/
```

`ShotKit --test` takes one screenshot and records 4 seconds, then quits (used to check a build).
