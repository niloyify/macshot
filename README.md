# Shot

A tiny menu bar screenshot tool for macOS (working name).

- **Capture Area** — Option+Shift+1
- **Capture Window** — Option+Shift+2
- **Capture Full Screen** — Option+Shift+3
- **Open Screenshots Folder**

Each capture is saved as a PNG in `~/ScreenshotTool/Screenshots` and copied to the clipboard.

## Build

Needs macOS 13 or later and the Xcode Command Line Tools (`xcode-select --install`).

```bash
./build.sh
open Shot.app
```

## Permission

On first launch, allow **Shot** under System Settings → Privacy & Security → Screen & System Audio Recording, then quit and reopen it.

The app is ad-hoc signed, so macOS treats every new build as a new app: after rebuilding, remove the old **Shot** entry from that list and add the new one.
