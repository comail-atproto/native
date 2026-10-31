import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const revision = '8ec08702be81aeec02ce1d060d7ee6cebc9d782c';
const { values } = parseArgs({ options: { 'branding-dir': { type: 'string' } } });
if (!values['branding-dir']) throw new Error('Usage: node scripts/sync-comail-wiggle.mjs --branding-dir /path/to/branding');
const branding = resolve(values['branding-dir']);
if (execFileSync('git', ['-C', branding, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== revision) {
  throw new Error(`Use branding revision ${revision}; asset generation must use the pinned tool.`);
}
const tool = join(branding, 'wigglify');
const sharp = createRequire(join(tool, 'package.json'))('sharp');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'assets/comail');
const output = join(assets, 'wiggle');
const scratch = await mkdtemp(join(tmpdir(), 'comail-wiggle-'));
const manifest = { brandingRevision: revision, frames: 3, fps: 10, assets: {} };
const run = args => execFileSync(process.execPath, [join(tool, 'src/cli.ts'), ...args], { cwd: tool, stdio: ['ignore', 'ignore', 'inherit'] });
try {
  await mkdir(output, { recursive: true });
  const names = ['cammie', 'spooky', 'leaf1', 'leaf2', 'leaf3', 'mail1', 'mail2', 'mail3', 'wordmark-light', 'wordmark-dark', 'wordmark-spooky'];
  for (const name of names) {
    const animated = join(output, `${name}.webp`);
    if (name === 'spooky') {
      await copyFile(join(tool, 'assets/spooky.webp'), animated);
    } else {
      const wordmark = name.startsWith('wordmark-');
      const input = wordmark ? join(assets, `${name}.svg`) : join(scratch, `${name}.svg`);
      if (!wordmark) {
        const source = name === 'cammie' ? join(assets, 'cammie-mark.png') : join(assets, 'particles', `${name}.png`);
        run(['trace', source, '-o', input]);
      }
      run([input, '-o', animated, '--frames', '3', '--fps', '10', '--seed', '1', '--no-prompt', ...(wordmark ? ['--pixel', `${10 / 3}`] : [])]);
    }
    await sharp(animated, { page: 0, pages: 1 }).png().toFile(join(output, `${name}.png`));
    const metadata = await sharp(animated, { animated: true }).metadata();
    manifest.assets[name] = { width: metadata.width, height: metadata.pageHeight, frames: metadata.pages };
    console.log(`${name}: ${metadata.pages} frames, ${metadata.width}×${metadata.pageHeight}`);
  }
  await writeFile(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
