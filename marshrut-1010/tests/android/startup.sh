#!/usr/bin/env bash
set -euo pipefail

app=ru.alim.marshrut1010
activity="$app/.MainActivity"
apk="$1"
results="$2"
mkdir -p "$results"

trap 'adb logcat -d -s AndroidRuntime chromium Capacitor > "$results/logcat.txt"' EXIT

expect_scene() {
  local label="$1"
  local rotation="$2"
  local view=/sdcard/route-window.xml
  local expected_rotation=0
  if [[ "$rotation" == landscape ]]; then expected_rotation=1; fi
  for attempt in {1..12}; do
    adb shell uiautomator dump "$view" >/dev/null 2>&1 || continue
    adb exec-out cat "$view" > "$results/$label.xml"
    if grep -q '3D-сцена запущена' "$results/$label.xml" &&
       grep -q "<hierarchy rotation=\"$expected_rotation\"" "$results/$label.xml"; then
      adb exec-out screencap -p > "$results/$label.png"
      python3 - "$results/$label.png" "$rotation" <<'PY'
import struct
import sys
from pathlib import Path

width, height = struct.unpack_from('>II', Path(sys.argv[1]).read_bytes(), 16)
assert (width > height) == (sys.argv[2] == 'landscape'), (width, height, sys.argv[2])
print(f'3D scene rendered offline in {sys.argv[2]} at {width}×{height}')
PY
      return
    fi
    sleep 2
  done
  adb exec-out screencap -p > "$results/$label.png"
  cat "$results/$label.xml" >&2 || true
  return 1
}

adb logcat -c
adb install -r "$apk"
adb shell cmd connectivity airplane-mode enable
adb shell svc wifi disable
adb shell svc data disable
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard
# This emulator is fresh and would otherwise show a system tutorial over the app.
adb shell settings put secure immersive_mode_confirmations confirmed
adb shell cmd window user-rotation lock 0
adb shell am force-stop "$app"
adb shell am start -W -n "$activity"
expect_scene cold-start portrait

adb shell cmd window user-rotation lock 1
expect_scene rotation landscape

adb shell input keyevent KEYCODE_HOME
adb shell am start -W -n "$activity"
expect_scene resume landscape
