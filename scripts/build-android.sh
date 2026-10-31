#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../android"
if [[ "$(uname -s)" == Darwin ]]; then
  if [[ -d /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ]]; then
    export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
  else
    export JAVA_HOME="$(/usr/libexec/java_home -v 17)"
  fi
  export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
fi
./gradlew :app:assembleDebug --console=plain
