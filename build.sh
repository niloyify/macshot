#!/bin/bash
# Builds Shot.app from main.swift. Run: ./build.sh
# The app runs on both Apple Silicon and Intel Macs, macOS 13 or later.
set -euo pipefail
cd "$(dirname "$0")"

APP="Shot.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"

TMP="$(mktemp -d)"
for ARCH in arm64 x86_64; do
    swiftc -swift-version 5 -O -target "$ARCH-apple-macos13.0" main.swift -o "$TMP/Shot-$ARCH"
done
lipo -create "$TMP/Shot-arm64" "$TMP/Shot-x86_64" -output "$APP/Contents/MacOS/Shot"
rm -rf "$TMP"

cat > "$APP/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key><string>Shot</string>
    <key>CFBundleIdentifier</key><string>local.shot.screenshot.v2</string>
    <key>CFBundleExecutable</key><string>Shot</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>1.0</string>
    <key>LSMinimumSystemVersion</key><string>13.0</string>
    <key>LSUIElement</key><true/>
</dict>
</plist>
EOF

# Ad-hoc signature so macOS remembers the Screen Recording permission.
codesign --force --sign - "$APP"
echo "Built $(pwd)/$APP"
