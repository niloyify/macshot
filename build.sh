#!/bin/bash
# Builds MacShot.app from main.swift and recorder.swift. Run: ./build.sh
# The app runs on both Apple Silicon and Intel Macs, macOS 13 or later.
set -euo pipefail
cd "$(dirname "$0")"

APP="MacShot.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

TMP="$(mktemp -d)"
for ARCH in arm64 x86_64; do
    swiftc -swift-version 5 -O -target "$ARCH-apple-macos13.0" main.swift recorder.swift -o "$TMP/MacShot-$ARCH"
done
lipo -create "$TMP/MacShot-arm64" "$TMP/MacShot-x86_64" -output "$APP/Contents/MacOS/MacShot"

# App icon: the 👀 emoji, drawn by icon.swift and packed into an .icns file.
swift icon.swift "$TMP/icon.png"
ICONSET="$TMP/MacShot.iconset"
mkdir -p "$ICONSET"
for S in 16 32 128 256 512; do
    sips -z "$S" "$S" "$TMP/icon.png" --out "$ICONSET/icon_${S}x${S}.png" >/dev/null
    sips -z "$((S * 2))" "$((S * 2))" "$TMP/icon.png" --out "$ICONSET/icon_${S}x${S}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/MacShot.icns"
rm -rf "$TMP"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key><string>MacShot</string>
    <key>CFBundleIdentifier</key><string>local.macshot.screenshot</string>
    <key>CFBundleExecutable</key><string>MacShot</string>
    <key>CFBundleIconFile</key><string>MacShot</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>1.3</string>
    <key>LSMinimumSystemVersion</key><string>13.0</string>
    <key>LSUIElement</key><true/>
    <key>NSMicrophoneUsageDescription</key><string>MacShot records your voice and the sound around you.</string>
</dict>
</plist>
PLIST

# Ad-hoc signature so macOS remembers the Screen Recording permission.
codesign --force --sign - "$APP"
echo "Built $(pwd)/$APP"
