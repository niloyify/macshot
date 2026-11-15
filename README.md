# MacShot

A tiny menu bar screenshot tool for macOS.

- **Capture Area** — Option+Shift+1
- **Capture Window** — Option+Shift+2
- **Capture Full Screen** — Option+Shift+3
- **Open Screenshots Folder**

Each capture is saved as a PNG in `~/ScreenshotTool/Screenshots` and copied to the clipboard.

## Download and install

Works on Apple Silicon and Intel Macs with macOS 13 or later.

1. Download **[MacShot.zip](https://github.com/niloyify/macshot/releases/latest/download/MacShot.zip)**.
2. Unzip it and move **MacShot** to your **Applications** folder.
3. Open **MacShot**. macOS will block it the first time, because the app is not notarized by Apple.
4. Go to System Settings → Privacy & Security, scroll down and click **Open Anyway**, then open **MacShot** again.
5. Allow **MacShot** under System Settings → Privacy & Security → Screen & System Audio Recording, then quit and reopen it.

A pair of eyes on a blue square appears in the menu bar. They follow your mouse pointer and blink. Click it, or use the shortcuts above.

## Build it yourself

Needs the Xcode Command Line Tools (`xcode-select --install`).

```bash
./build.sh
open MacShot.app
```

The app is ad-hoc signed, so macOS treats every new build as a new app: after rebuilding, remove the old **MacShot** entry from the Screen & System Audio Recording list and add the new one.
