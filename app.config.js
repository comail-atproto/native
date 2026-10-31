const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const VERSION = fs.readFileSync(path.join(__dirname, 'VERSION'), 'utf8').trim();

let COMMIT = process.env.GITHUB_SHA || '';
if (!COMMIT) {
  try {
    COMMIT = execSync('git rev-parse --short HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    COMMIT = 'dev';
  }
}
COMMIT = COMMIT.slice(0, 7);

// App Store Connect rejects a build whose CFBundleVersion it has already seen
// for this CFBundleShortVersionString, so this has to advance on every upload
// even when VERSION does not. CI passes the workflow run number; local builds
// fall back to 1 (never uploaded).
const IOS_BUILD_NUMBER = process.env.IOS_BUILD_NUMBER || '1';

module.exports = {
  expo: {
    name: 'Comail',
    slug: 'comail-native',
    // The native OAuth callback and OS mail links.
    scheme: ['comailnative', 'mailto'],
    version: VERSION,
    orientation: 'default',
    icon: './assets/comail/icon-light.png',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/comail/spooky.png',
      resizeMode: 'contain',
      backgroundColor: '#313638',
      dark: {
        image: './assets/comail/spooky.png',
        backgroundColor: '#313638',
      },
    },
    ios: {
      icon: {
        light: './assets/comail/icon-light.png',
        dark: './assets/comail/icon-dark.png',
      },
      supportsTablet: true,
      bundleIdentifier: 'at.comail.app',
      infoPlist: {
        UIApplicationSceneManifest: {
          UIApplicationSupportsMultipleScenes: false,
          UISceneConfigurations: {
            UIWindowSceneSessionRoleApplication: [{
              UISceneConfigurationName: 'Comail',
              UISceneDelegateClassName: 'ComailSceneDelegate',
            }],
          },
        },
      },
      buildNumber: IOS_BUILD_NUMBER,
      config: {
        // The app only speaks HTTPS/TLS and uses platform crypto, which is
        // exempt. Declaring it here skips the manual export-compliance
        // questionnaire that otherwise blocks every TestFlight build.
        usesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/comail/icon-foreground.png',
        backgroundColor: '#F5F5E0',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: 'at.comail.mobile',
      // The AsyncStorage database holds cached message bodies, the outbox and
      // the account registry; the platform backup would ship all of it to the
      // user's Google account. Credentials live in SecureStore (excluded by
      // its own rules) but the mail cache must not leave the device either.
      allowBackup: false,
      // Compose uses expo-image-picker's camera flow; keep its Android grant.
      permissions: ['android.permission.CAMERA'],
    },
    web: {
      favicon: './assets/comail/icon-light.png',
    },
    plugins: [
      './plugins/with-ios-scenes',
      './plugins/with-ios-local-notifications',
      'expo-secure-store',
      '@react-native-community/datetimepicker',
      'expo-localization',
      [
        'expo-image-picker',
        {
          photosPermission:
            'Comail uses your selected photos for email attachments and contact photos.',
          cameraPermission:
            'Comail uses the camera to take email attachment photos.',
          microphonePermission: false,
        },
      ],
    ],
    extra: {
      comailServices: true,
      commit: COMMIT,
      // Settings → About → Source code. A modified build sets SOURCE_CODE_URL
      // to where its own source is (AGPL §13); the default is this repository.
      sourceCodeUrl: process.env.SOURCE_CODE_URL || 'https://github.com/comail-atproto/comail-native',
    },
  },
};
