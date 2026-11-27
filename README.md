# MacShot

> MacShot for **Windows, macOS and Linux**: MacShot is now part of **[Jhuli](touchkit/README.md)** (TouchKit + MacShot in one app for Windows, macOS, Linux, Android, iPhone and the web).
>
> Want more? [TouchKit](touchkit/README.md) is the all-in-one version for Windows, macOS and Linux: phone remote, on-screen Touch Bar, window snap, screenshots, recording and 20+ everyday tools.

A tiny menu bar screenshot and screen recording tool for macOS.

- **Capture Area** — Option+Shift+1
- **Capture Window** — Option+Shift+2
- **Capture Full Screen** — Option+Shift+3
- **Start / Stop Recording** — Option+Shift+5 (macOS 15 or later)
- **Start / Stop Sound Recording** — Option+Shift+6 (sound only, from the microphone)
- **Open Screenshots Folder** / **Open Recordings Folder**

Each capture is saved as a PNG in `~/ScreenshotTool/Screenshots` and copied to the clipboard.

Screen recordings capture the main screen with the Mac's own sound (music, videos) and your microphone, and are saved as `.mov` files in `~/ScreenshotTool/Recordings`. While recording, the eyes in the menu bar sit on a **red** square; press Option+Shift+5 again (or choose Stop Recording) to save.

Sound recordings capture only the sound around you (a class, a party, a meeting) through the microphone, and are saved as `.m4a` files in the same Recordings folder. The eyes also turn red while sound is recording; press Option+Shift+6 again to save.

## Download and install

Works on Apple Silicon and Intel Macs with macOS 13 or later.

1. Download **[MacShot.zip](https://github.com/niloyify/macshot/releases/latest/download/MacShot.zip)**.
2. Unzip it and move **MacShot** to your **Applications** folder.
3. Open **MacShot**. macOS will block it the first time, because the app is not notarized by Apple.
4. Go to System Settings → Privacy & Security, scroll down and click **Open Anyway**, then open **MacShot** again.
5. Allow **MacShot** under System Settings → Privacy & Security → Screen & System Audio Recording, then quit and reopen it. For recordings with your voice, also click **Allow** when MacShot asks for the microphone.

A pair of eyes on a blue square appears in the menu bar. They follow your mouse pointer and blink. Click it, or use the shortcuts above.

## Build it yourself

Needs the Xcode Command Line Tools (`xcode-select --install`).

```bash
./build.sh
open MacShot.app
```

The app is ad-hoc signed, so macOS treats every new build as a new app: after rebuilding, remove the old **MacShot** entry from the Screen & System Audio Recording list and add the new one.
