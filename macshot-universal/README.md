# MacShot for Windows, macOS and Linux

The same MacShot, now on every computer. It lives in the system tray (menu bar on macOS) as a pair of eyes that turns red while recording.

| Shortcut | What it does |
| --- | --- |
| Alt+Shift+1 | **Capture Area**: drag a rectangle, Esc cancels |
| Alt+Shift+3 | **Capture Full Screen** (the screen under the mouse pointer) |
| Alt+Shift+5 | **Start / Stop Recording** the screen with your microphone (and the computer's sound on Windows) |
| Alt+Shift+6 | **Start / Stop Sound Recording**: only the sound around you, from the microphone |

Screenshots are saved as PNG in `Pictures/MacShot` and copied to the clipboard. Recordings go to `Videos/MacShot` (`Movies/MacShot` on macOS): screen as MP4, sound as M4A. The tray menu also opens both folders and can start MacShot at login (Windows and macOS).

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

`MacShot --test` takes a full and an area screenshot, records 4 seconds of screen and 4 seconds of sound, then quits (used to check a build).
