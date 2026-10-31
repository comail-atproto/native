import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, readdir, rmSync } from 'node:fs';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

describe('glob build dependency security', () => {
  it('bounds pattern expansion in minimatch and the bundled glob entry points', async () => {
    const pattern = Array(8).fill('**/../a/b').join('/');
    const { Minimatch } = require('minimatch');
    const { Glob } = require('glob');
    expect(new Minimatch(pattern, { optimizationLevel: 2, braceExpandMax: 64 }).set.length).toBe(64);
    expect(new Glob(pattern, { braceExpandMax: 64 }).patterns.length).toBe(64);
    const esmGlob = await import('glob');
    expect(new esmGlob.Glob(pattern, { braceExpandMax: 64 }).patterns.length).toBe(64);
  });

  it('only permits the tested legacy or fixed minimatch versions in the lockfile', () => {
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    const { gte } = require('semver');
    const entries = Object.entries(lock.packages as Record<string, { version?: string }>)
      .filter(([path]) => path.endsWith('/node_modules/minimatch') || path === 'node_modules/minimatch');
    expect(entries.length).toBeGreaterThan(0);
    for (const [path, packageInfo] of entries) {
      const version = packageInfo.version;
      expect(version).toBeDefined();
      if (version === '3.1.5') {
        const { Minimatch } = require(join(process.cwd(), path));
        expect(Minimatch.prototype.firstPhasePreProcess).toBeUndefined();
      } else {
        expect(gte(version, '11.0.1'), `${path} must use a fixed minimatch`).toBe(true);
      }
    }
  });

  it('does not continue reading directories after an abort', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'glob-abort-'));
    try {
      const make = (parent: string, depth: number) => {
        if (!depth) return;
        for (const name of ['a', 'b']) {
          const child = join(parent, name);
          mkdirSync(child);
          make(child, depth - 1);
        }
      };
      make(cwd, 4);
      const controller = new AbortController();
      let calls = 0;
      const customFs = { ...fs, readdir: (...args: Parameters<typeof readdir>) => {
        if (++calls === 1) controller.abort(new Error('test abort'));
        return (readdir as (...args: any[]) => void)(...args);
      } };
      const { glob } = require('glob');
      await expect(glob('**', { cwd, signal: controller.signal, fs: customFs })).rejects.toThrow('test abort');
      const atAbort = calls;
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(calls).toBe(atAbort);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
