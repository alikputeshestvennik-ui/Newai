#!/usr/bin/env bash
set -euo pipefail

app=ru.alim.marshrut1010
activity="$app/.MainActivity"
apk="$1"
results="$2"
ready=$(node -p 'require("./marshrut-1010/data/ru.json").ready')
mkdir -p "$results"

trap 'adb logcat -d -s AndroidRuntime chromium Capacitor > "$results/logcat.txt"' EXIT

expect_scene() {
  local label="$1"
  local view=/sdcard/route-window.xml
  local close_x close_y
  for attempt in {1..12}; do
    adb shell uiautomator dump "$view" >/dev/null 2>&1 || continue
    adb exec-out cat "$view" > "$results/$label.xml"
    if grep -Fq "Pixel Launcher isn't responding" "$results/$label.xml"; then
      # A launcher ANR can cover the app on fresh GitHub-hosted emulators.
      read -r close_x close_y < <(python3 - "$results/$label.xml" <<'PY'
import re
import sys
from xml.etree import ElementTree

button = ElementTree.parse(sys.argv[1]).find('.//node[@resource-id="android:id/aerr_close"]')
left, top, right, bottom = map(int, re.findall(r'-?\d+', button.attrib['bounds']))
print((left + right) // 2, (top + bottom) // 2)
PY
      )
      adb shell input tap "$close_x" "$close_y"
    fi
    if grep -Fq "$ready" "$results/$label.xml" &&
       grep -Eq '<hierarchy rotation="[13]"' "$results/$label.xml"; then
      adb exec-out screencap -p > "$results/$label.png"
      python3 - "$results/$label.png" <<'PY'
import struct
import sys
from pathlib import Path

width, height = struct.unpack_from('>II', Path(sys.argv[1]).read_bytes(), 16)
assert width > height, (width, height)
print(f'3D scene rendered offline in landscape at {width}×{height}')
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
expect_scene cold-start

adb shell cmd window user-rotation lock 1
expect_scene system-landscape
adb shell cmd window user-rotation lock 0
expect_scene system-portrait

adb shell input keyevent KEYCODE_HOME
adb shell am start -W -n "$activity"
expect_scene resume
