# Comail Native source

Checked development source for Comail's iOS and Android clients, based on
[Bulwark Native](https://github.com/bulwarkmail/native). `PUBLIC_SOURCE.json`
identifies the exact source snapshot and upstream revision. Private development
history, operations and signing credentials are excluded.

These source releases do not distribute a signed application or enable App Store,
TestFlight or Android package publication. Native service and physical-device
acceptance remain development work.

## Build and test

Use Node 24.22.1 and install the locked dependencies:

```sh
npm ci
npm run typecheck
npm test
npm run build:android
ENTRY_FILE=index.ts npm run build:ios
```

Android requires JDK 17 and an Android SDK. iOS requires macOS, Xcode and
CocoaPods. The iOS project is generated from `app.config.js`; the Android project
is maintained in source. Both compile checks use unsigned or debug builds and
need no release signing credentials.

Firebase configuration and app-store signing keys are not supplied. Builds
without Firebase configuration compile; FCM setup then reports a configuration
error. Configure your own service endpoints and credentials when running a fork.

## Publication and license

The protected publisher checks the frozen source, dependencies, unit tests and
Android/iOS builds before publishing a weekly snapshot. Manual publication uses
the same checks. Failed checks and live holds stop publication; retries preserve
existing releases and mirror refs.

The matching mirror is [Comail Native on Tangled](https://tangled.org/comail.at/native).
Upstream authorship, the [AGPL license](LICENSE), its app-store permission and
bundled font licenses remain in the source. Public contributions still require
review and passing checks.
