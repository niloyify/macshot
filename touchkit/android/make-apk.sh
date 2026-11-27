#!/bin/bash
# Runs inside the build container. /app = touchkit, /keys = signing key folder.
set -euo pipefail
VERSION="$1"; CODE="$2"
BT=/opt/sdk/build-tools/34.0.0; JAR=/opt/sdk/platforms/android-34/android.jar
cd /app/android
rm -rf out && mkdir -p out/assets out/gen out/classes out/dex
cp -R /app/web out/assets/web
cat > out/gen/BuildInfo.java <<J
package io.github.niloyify.touchkit;
final class BuildInfo { static final String VERSION = "$VERSION"; }
J
$BT/aapt2 compile --dir res -o out/res.zip
$BT/aapt2 link -o out/base.apk -I $JAR --manifest AndroidManifest.xml -A out/assets --java out/gen \
  --min-sdk-version 24 --target-sdk-version 34 --version-code "$CODE" --version-name "$VERSION" out/res.zip
javac -nowarn --release 11 -classpath $JAR -d out/classes $(find src out/gen -name '*.java')
$BT/d8 --release --min-api 24 --lib $JAR --output out/dex $(find out/classes -name '*.class')
cp out/base.apk out/unsigned.apk && (cd out/dex && zip -q ../unsigned.apk classes.dex)
$BT/zipalign -p -f 4 out/unsigned.apk out/aligned.apk
PASS=$(cat /keys/password)
$BT/apksigner sign --ks /keys/touchkit.jks --ks-pass "pass:$PASS" --key-pass "pass:$PASS" --out "out/TouchKit-$VERSION.apk" out/aligned.apk
$BT/apksigner verify "out/TouchKit-$VERSION.apk"
ls -la "out/TouchKit-$VERSION.apk"
