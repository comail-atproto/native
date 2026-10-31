import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { getPngInfo } from '@expo/image-utils';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const config = require('../../../app.config.js').expo;

it.each(['light', 'dark'])('ships an opaque 1024px %s iOS icon', async appearance => {
  expect(config.ios.icon).toHaveProperty(appearance);
  const png = await getPngInfo(resolve(config.ios.icon[appearance]));
  expect([png.width, png.height]).toEqual([1024, 1024]);
  if (png.bpp === 4) {
    let transparent = 0;
    for (let i = 3; i < png.data.length; i += 4) if (png.data[i] !== 255) transparent++;
    expect(transparent).toBe(0);
  } else expect(png.bpp).toBe(3);
});

it('keeps Android adaptive artwork transparent around its safe zone', async () => {
  const png = await getPngInfo(resolve(config.android.adaptiveIcon.foregroundImage));
  expect(png.bpp).toBe(4);
  let outside = 0;
  let inside = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const alpha = png.data[(y * png.width + x) * 4 + 3];
      if (x < png.width * 0.19 || x >= png.width * 0.81 || y < png.height * 0.19 || y >= png.height * 0.81) outside += alpha;
      else inside += alpha;
    }
  }
  expect(outside).toBe(0);
  expect(inside).toBeGreaterThan(0);
});

it('keeps the registered Comail iOS app identity and version floor', () => {
  expect(config.ios.bundleIdentifier).toBe('at.comail.app');
  expect(Number(config.version.split('.')[0])).toBeGreaterThanOrEqual(1);
});

it('gives the mascot enough area to read at Android launcher sizes', async () => {
  const png = await getPngInfo(resolve(config.android.adaptiveIcon.foregroundImage));
  let visible = 0;
  let safeArea = 0;
  for (let y = Math.ceil(png.height * 0.2); y < png.height * 0.8; y++) {
    for (let x = Math.ceil(png.width * 0.2); x < png.width * 0.8; x++) {
      safeArea++;
      if (png.data[(y * png.width + x) * 4 + 3] > 127) visible++;
    }
  }
  expect(visible / safeArea).toBeGreaterThan(0.6);
});

it.each(['leaf1', 'leaf2', 'leaf3', 'mail1', 'mail2', 'mail3'])('ships transparent ambient artwork: %s', async name => {
  const png = await getPngInfo(resolve(`assets/comail/particles/${name}.png`));
  expect(png.bpp).toBe(4);
  let transparent = 0;
  let visible = 0;
  for (let i = 3; i < png.data.length; i += 4) {
    if (png.data[i] === 0) transparent++;
    if (png.data[i] > 127) visible++;
  }
  expect(transparent).toBeGreaterThan(png.width * png.height * 0.2);
  expect(visible).toBeGreaterThan(100);
});
