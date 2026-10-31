import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const expoRequire = createRequire(require.resolve('@expo/metro-config/package.json'));
const directories: string[] = [];

function temporaryProject(): string {
  const directory = mkdtempSync(join(tmpdir(), 'comail-build-test-'));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Expo build dependency security', () => {
  it('applies the dependency patch when installed in an exported tree inside a checkout', () => {
    const parent = temporaryProject();
    const project = join(parent, 'export');
    mkdirSync(join(project, 'node_modules'), { recursive: true });
    mkdirSync(join(project, 'patches'));
    cpSync(join(process.cwd(), 'node_modules/deepmerge'), join(project, 'node_modules/deepmerge'), { recursive: true });
    cpSync(join(process.cwd(), 'patches/deepmerge+4.3.1.patch'), join(project, 'patches/deepmerge+4.3.1.patch'));
    writeFileSync(join(project, 'package.json'), readFileSync(join(process.cwd(), 'package.json')));
    expect(spawnSync('git', ['init', '-q', parent]).status).toBe(0);
    const unpatch = spawnSync('git', ['apply', '--reverse', 'patches/deepmerge+4.3.1.patch'], {
      cwd: project, env: { ...process.env, GIT_CEILING_DIRECTORIES: parent }, encoding: 'utf8',
    });
    expect(unpatch.status, unpatch.stderr).toBe(0);
    for (let i = 0; i < 2; i++) {
      const install = spawnSync('npm', ['run', 'postinstall'], { cwd: project, encoding: 'utf8' });
      expect(install.status, install.stderr).toBe(0);
      const merge = createRequire(join(project, 'package.json'))('deepmerge');
      const result = merge(JSON.parse('{"__proto__":{"unexpectedBuildSetting":true}}'), {});
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
      expect(result.unexpectedBuildSetting).toBeUndefined();
    }
  });

  it.each(['deepmerge', 'deepmerge/dist/umd.js'])('blocks prototype keys in %s config merges', (entrypoint) => {
    const configRequire = createRequire(require.resolve('@expo/config/package.json'));
    const merge = configRequire(entrypoint);
    const payload = () => JSON.parse('{"__proto__":{"unexpectedBuildSetting":true},"constructor":{"prototype":{"unexpectedBuildSetting":true}},"prototype":{"unexpectedBuildSetting":true}}');
    const results = [
      merge({ session: null }, { session: payload() }).session,
      merge(Object.create(null), payload()),
      merge(payload(), {}),
    ];
    for (const result of results) {
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
      expect(result.unexpectedBuildSetting).toBeUndefined();
      for (const key of ['__proto__', 'constructor', 'prototype']) {
        expect(Object.hasOwn(result, key)).toBe(false);
      }
    }
    expect(merge({ plugins: ['first'], ios: { supportsTablet: false } }, {
      plugins: ['second'], ios: { supportsTablet: true },
    })).toEqual({ plugins: ['first', 'second'], ios: { supportsTablet: true } });
  });

  it('rejects an ICNS chunk with zero length masquerading as a PNG without hanging', () => {
    // Run the parser in a child so a regression cannot hang the test runner.
    const result = spawnSync(process.execPath, ['-e', `
      const { createRequire } = require('node:module');
      const expo = createRequire(require.resolve('@expo/metro/package.json'));
      const { getAssetSize } = expo('metro/private/Assets');
      if (typeof getAssetSize !== 'function') process.exit(2);
      const content = Buffer.from('69636e73000000106963303700000000', 'hex');
      try { getAssetSize('png', content, 'malformed.png'); }
      catch { process.exit(0); }
      process.exit(1);
    `], { timeout: 5000, encoding: 'utf8' });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
  }, 10_000);

  it('preserves PNG dimensions through Expo’s Metro wrapper', () => {
    const metroRequire = createRequire(require.resolve('@expo/metro/package.json'));
    const { getAssetSize } = metroRequire('metro/private/Assets');
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZqkAAAAASUVORK5CYII=',
      'base64',
    );
    expect(getAssetSize('png', pixel, 'pixel.png')).toEqual({ width: 1, height: 1 });
  });

  it('does not read a CSS-provided source map without a trusted input filename', () => {
    const project = temporaryProject();
    const map = join(project, 'private.map');
    writeFileSync(map, JSON.stringify({
      version: 3,
      sources: ['private.css'],
      names: [],
      mappings: 'AAAA',
      sourcesContent: ['synthetic private fixture'],
    }));
    const postcss = expoRequire('postcss');
    const input = new postcss.Input(`a{}\n/*# sourceMappingURL=${map} */`);
    expect(input.map?.text).toBeUndefined();
  });

  it('preserves Expo CSS plugin transforms with the patched PostCSS API', async () => {
    const project = temporaryProject();
    writeFileSync(join(project, 'postcss.config.js'), `
      module.exports = { plugins: [{
        postcssPlugin: 'comail-test',
        Declaration(declaration) {
          if (declaration.prop === 'color') declaration.value = 'blue';
        },
      }] };
    `);
    const { transformPostCssModule } = expoRequire('./build/transform-worker/postcss.js');
    const result = await transformPostCssModule(project, {
      src: 'a { color: red }',
      filename: join(project, 'test.css'),
    });
    expect(result.hasPostcss).toBe(true);
    expect(result.src).toBe('a { color: blue }');
  });
});
