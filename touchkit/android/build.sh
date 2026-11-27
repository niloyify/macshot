#!/bin/bash
# Builds the signed Jhuli APK with Docker: android/out/Jhuli-<version>.apk
# The signing key lives outside the repo in ~/.touchkit-android (keep a copy safe:
# without it, phones cannot update the app, only reinstall).
set -euo pipefail
cd "$(dirname "$0")"
VERSION=$(sed -n "s/.*version: '\([^']*\)'.*/\1/p" ../web/config.js)
CODE=$(echo "$VERSION" | awk -F. '{print $1*10000+$2*100+$3}')
KEYS="$HOME/.touchkit-android"
docker build -q --platform linux/amd64 -t touchkit-android-sdk . >/dev/null
if [ ! -f "$KEYS/touchkit.jks" ]; then
  mkdir -p "$KEYS" && chmod 700 "$KEYS"
  head -c 24 /dev/urandom | base64 | tr -d '/+=' > "$KEYS/password"
  docker run --rm --platform linux/amd64 -v "$KEYS:/keys" touchkit-android-sdk keytool -genkeypair -keystore /keys/touchkit.jks \
    -alias touchkit -keyalg RSA -keysize 4096 -validity 36500 -storepass "$(cat "$KEYS/password")" -dname "CN=TouchKit, O=niloyify"
fi
docker run --rm --platform linux/amd64 -v "$(cd .. && pwd):/app" -v "$KEYS:/keys:ro" touchkit-android-sdk bash /app/android/make-apk.sh "$VERSION" "$CODE"
