# Shot

A tiny menu bar screenshot tool for macOS (working name).

- **Capture Area** — Option+Shift+1
- **Capture Window** — Option+Shift+2
- **Capture Full Screen** — Option+Shift+3
- **Open Screenshots Folder**

Each capture is saved as a PNG in `~/ScreenshotTool/Screenshots` and copied to the clipboard.

## Download and install

Works on Apple Silicon and Intel Macs with macOS 13 or later.

1. Download **[Shot.zip](https://github.com/niloyify/shot/releases/latest/download/Shot.zip)**.
2. Unzip it and move **Shot** to your **Applications** folder.
3. Open **Shot**. macOS will block it the first time, because the app is not notarized by Apple.
4. Go to System Settings → Privacy & Security, scroll down and click **Open Anyway**, then open **Shot** again.
5. Allow **Shot** under System Settings → Privacy & Security → Screen & System Audio Recording, then quit and reopen it.

A camera icon appears in the menu bar. Click it, or use the shortcuts above.

## Build it yourself

Needs the Xcode Command Line Tools (`xcode-select --install`).

```bash
./build.sh
open Shot.app
```

The app is ad-hoc signed, so macOS treats every new build as a new app: after rebuilding, remove the old **Shot** entry from the Screen & System Audio Recording list and add the new one.
