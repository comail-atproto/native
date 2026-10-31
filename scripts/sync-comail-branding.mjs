import { compositeImagesAsync, generateImageAsync, generateImageBackgroundAsync } from '@expo/image-utils';
import { execFileSync } from 'node:child_process';
import { writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'assets/comail');
const src = join(assets, 'cammie-mark.png');
const mascot = (await generateImageAsync({ projectRoot: root }, {
  src, width: 780, height: 780, resizeMode: 'contain',
})).source;
for (const appearance of ['light', 'dark', 'spooky']) {
  execFileSync('rsvg-convert', ['--width', '958', '--height', '300',
    '--output', join(assets, `wordmark-${appearance}.png`), join(assets, `wordmark-${appearance}.svg`)]);
}
for (const [appearance, backgroundColor] of [['light', '#F5F5E0'], ['dark', '#03413C']]) {
  let artwork = await generateImageBackgroundAsync({ width: 1024, height: 1024, resizeMode: 'contain', backgroundColor: 'transparent' });
  artwork = await compositeImagesAsync({ foreground: mascot, background: artwork, x: 122, y: 122 });
  const background = await generateImageBackgroundAsync({ width: 1024, height: 1024, resizeMode: 'contain', backgroundColor });
  await writeFile(join(assets, `icon-${appearance}.png`), await compositeImagesAsync({ foreground: artwork, background }));
  const opaque = (await generateImageAsync({ projectRoot: root }, {
    src: join(assets, `icon-${appearance}.png`), width: 1024, height: 1024,
    resizeMode: 'contain', backgroundColor, removeTransparency: true,
  })).source;
  await writeFile(join(assets, `icon-${appearance}.png`), opaque);
}
// Adaptive foregrounds need transparent margins so launcher masks cannot crop the artwork.
const foreground = (await generateImageAsync({ projectRoot: root }, {
  src, width: 624, height: 624, resizeMode: 'contain',
})).source;
const adaptiveBackground = await generateImageBackgroundAsync({ width: 1024, height: 1024, resizeMode: 'contain', backgroundColor: 'transparent' });
await writeFile(join(assets, 'icon-foreground.png'), await compositeImagesAsync({ foreground, background: adaptiveBackground, x: 200, y: 200 }));

for (const [density, scale] of Object.entries({ mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 })) {
  for (const name of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground']) {
    const size = Math.round((name.endsWith('foreground') ? 108 : 48) * scale);
    const { source } = await generateImageAsync({ projectRoot: root }, { src: join(assets, name.endsWith('foreground') ? 'icon-foreground.png' : 'icon-light.png'), width: size, height: size, resizeMode: 'contain' });
    const base = join(root, 'android/app/src/main/res', `mipmap-${density}`, name);
    await writeFile(`${base}.png`, source);
    await rm(`${base}.webp`, { force: true });
  }
  const { source: splash } = await generateImageAsync({ projectRoot: root }, { src: join(assets, 'spooky.png'), width: Math.round(288 * scale), height: Math.round(288 * scale), resizeMode: 'contain', backgroundColor: '#313638' });
  await writeFile(join(root, 'android/app/src/main/res', `drawable-${density}`, 'splashscreen_logo.png'), splash);
}
