import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);

it('generates Comail iOS entitlements without an unimplemented APNs capability', () => {
  const config = JSON.parse(execFileSync(process.execPath, [
    require.resolve('expo/bin/cli'), 'config', '--type', 'introspect', '--json',
  ], { encoding: 'utf8', env: { ...process.env, EXPO_NO_TELEMETRY: '1' } }));

  expect(config._internal.modResults.ios.entitlements).not.toHaveProperty('aps-environment');
});
