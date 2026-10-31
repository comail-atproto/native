import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const secrets = ['IOS_DIST_CERT_BASE64', 'IOS_DIST_CERT_PASSWORD', 'APPLE_TEAM_ID',
  'IOS_PROVISIONING_PROFILE_BASE64', 'APP_STORE_CONNECT_PRIVATE_KEY',
  'APP_STORE_CONNECT_KEY_ID', 'APP_STORE_CONNECT_ISSUER_ID'];

function run(upload: boolean, configured: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'comail-signing-'));
  const output = join(dir, 'output');
  try {
    const result = spawnSync(process.execPath, ['scripts/check-ios-signing.mjs'], {
      encoding: 'utf8', env: { NODE_ENV: 'test', GITHUB_OUTPUT: output, UPLOAD_TO_TESTFLIGHT: String(upload),
        ...Object.fromEntries(configured.map(name => [name, 'synthetic-secret'])) },
    });
    return { status: result.status, log: result.stdout + result.stderr,
      output: result.status === 0 ? readFileSync(output, 'utf8') : '' };
  } finally { rmSync(dir, { recursive: true }); }
}

it('rejects an upload without all signing and App Store credentials', () => {
  const result = run(true, secrets.filter(name => name !== 'APP_STORE_CONNECT_ISSUER_ID'));
  expect(result.status).toBe(1);
  expect(result.log).toContain('APP_STORE_CONNECT_ISSUER_ID');
  expect(result.log).not.toContain('synthetic-secret');
});

it('allows an unsigned compile only when no upload is requested', () => {
  expect(run(false, [])).toMatchObject({ status: 0, output: 'signed=false\n' });
});

it('selects a signed archive when every credential is configured', () => {
  const result = run(true, secrets);
  expect(result).toMatchObject({ status: 0, output: 'signed=true\n' });
  expect(result.log).not.toContain('synthetic-secret');
});
