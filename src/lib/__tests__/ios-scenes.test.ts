import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const app = require('../../../app.config.js').expo;
const template = execFileSync(
  'tar',
  [
    '-xOf',
    join(dirname(require.resolve('expo/package.json')), 'template.tgz'),
    'package/ios/HelloWorld/AppDelegate.swift',
  ],
  { encoding: 'utf8' },
);

async function migrate(contents: string, language = 'swift'): Promise<string> {
  const plugin = require('../../../plugins/with-ios-scenes');
  const config = plugin({ name: 'Comail', slug: 'comail-native' });
  const result = await config.mods.ios.appDelegate({
    ...config,
    modRequest: {},
    modResults: { language, contents },
  });
  return result.modResults.contents;
}

it('declares a single-window scene so iOS 27 can launch the generated app', () => {
  expect(app.ios.infoPlist?.UIApplicationSceneManifest).toEqual({
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [
        {
          UISceneConfigurationName: 'Comail',
          UISceneDelegateClassName: 'ComailSceneDelegate',
        },
      ],
    },
  });
});

it('migrates the installed Expo template and survives repeated prebuilds', async () => {
  const contents = await migrate(template);
  expect(contents).not.toContain('UIWindow(frame: UIScreen.main.bounds)');
  expect(contents).toContain('UIWindow(windowScene: windowScene)');
  expect(contents).toContain('@objc(ComailSceneDelegate)');
  expect(contents).toContain('bindReactNativeFactory(factory)');
  expect(await migrate(contents)).toBe(contents);
});

it('preserves cold links and forwards warm links and lifecycle events to Expo', async () => {
  const contents = await migrate(template);
  expect(contents).toContain('launchOptions[.url] = context.url');
  expect(contents).toContain('UIApplicationLaunchOptionsUserActivityKey');
  expect(contents).toContain(
    'appDelegate.application(UIApplication.shared, open: context.url, options: options)',
  );
  expect(contents).toContain(
    'appDelegate.application(UIApplication.shared, continue: userActivity',
  );
  for (const callback of [
    'applicationDidBecomeActive',
    'applicationWillResignActive',
    'applicationWillEnterForeground',
    'applicationDidEnterBackground',
  ]) {
    expect(contents).toContain(
      `appDelegate?.${callback}(UIApplication.shared)`,
    );
  }
});

it('refuses an unsupported delegate instead of generating a broken project', async () => {
  await expect(migrate('custom delegate')).rejects.toThrow('Expo SDK 54');
  await expect(migrate(template, 'objc')).rejects.toThrow('Swift');
});
