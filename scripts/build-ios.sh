#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export EXPO_NO_TELEMETRY=1
npx expo prebuild --platform ios --no-install
"${POD_BIN:-pod}" install --project-directory=ios
workspaces=(ios/*.xcworkspace)
if [[ "${#workspaces[@]}" -ne 1 || ! -d "${workspaces[0]}" ]]; then
  echo 'Expected one generated iOS workspace.' >&2
  exit 1
fi
workspace="${workspaces[0]}"
scheme="$(basename "$workspace" .xcworkspace)"
xcodebuild build \
  -workspace "$workspace" -scheme "$scheme" \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath ios/build/native \
  IPHONEOS_DEPLOYMENT_TARGET=15.1 \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=''
