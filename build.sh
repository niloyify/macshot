#!/bin/bash
# Builds Shot.app from main.swift. Run: ./build.sh
set -euo pipefail
cd "$(dirname "$0")"

APP="Shot.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"

swiftc -swift-version 5 -O main.swift -o "$APP/Contents/MacOS/Shot"

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
