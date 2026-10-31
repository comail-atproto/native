import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, expect, it } from 'vitest';

const directories: string[] = [];
const signing = await import(pathToFileURL(resolve('scripts/ios-signing.mjs')).href);

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'comail-ios-signing-'));
  directories.push(root);
  const state = join(root, 'state');
  mkdirSync(state);
  return { state, paths: [join(root, 'old location', 'profile.mobileprovision'), join(root, 'new location', 'profile.mobileprovision')] };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

it('removes only profiles installed by this run', () => {
  const { state, paths } = fixture();
  const data = Buffer.from('synthetic provisioning profile');
  mkdirSync(join(paths[0], '..'), { recursive: true });
  writeFileSync(paths[0], data);

  signing.installProfiles(data, paths, state);
  expect(readFileSync(paths[1])).toEqual(data);
  expect(statSync(paths[1]).mode & 0o777).toBe(0o600);
  signing.cleanupProfiles(state);

  expect(readFileSync(paths[0])).toEqual(data);
  expect(existsSync(paths[1])).toBe(false);
  signing.cleanupProfiles(state);
});

it('preserves conflicting profiles and cleans up a partial installation', () => {
  const { state, paths } = fixture();
  mkdirSync(join(paths[1], '..'), { recursive: true });
  writeFileSync(paths[1], 'existing profile');

  expect(() => signing.installProfiles(Buffer.from('new profile'), paths, state)).toThrow('already exists');
  signing.cleanupProfiles(state);

  expect(existsSync(paths[0])).toBe(false);
  expect(readFileSync(paths[1], 'utf8')).toBe('existing profile');
});

it('preserves a profile changed by another process before cleanup', () => {
  const { state, paths } = fixture();
  signing.installProfiles(Buffer.from('new profile'), paths, state);
  writeFileSync(paths[0], 'concurrent profile');
  signing.cleanupProfiles(state);

  expect(readFileSync(paths[0], 'utf8')).toBe('concurrent profile');
  expect(existsSync(paths[1])).toBe(false);
});
