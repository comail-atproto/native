import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getPngInfo } from '@expo/image-utils';
import { expect, it } from 'vitest';

const names = ['cammie', 'spooky', 'leaf1', 'leaf2', 'leaf3', 'mail1', 'mail2', 'mail3', 'wordmark-light', 'wordmark-dark', 'wordmark-spooky'];
it.each(names)('ships a transparent three-frame Wigglify loop and matching still: %s', async name => {
  const data = readFileSync(`assets/comail/wiggle/${name}.webp`);
  expect(data.toString('ascii', 0, 4)).toBe('RIFF');
  expect(data.toString('ascii', 8, 12)).toBe('WEBP');
  const chunks: { type: string; bytes: Buffer }[] = [];
  for (let at = 12; at + 8 <= data.length;) {
    const length = data.readUInt32LE(at + 4);
    chunks.push({ type: data.toString('ascii', at, at + 4), bytes: data.subarray(at + 8, at + 8 + length) });
    at += 8 + length + length % 2;
  }
  const canvas = chunks.find(chunk => chunk.type === 'VP8X')!.bytes;
  expect(canvas[0] & 0x10).toBeTruthy();
  expect(chunks.find(chunk => chunk.type === 'ANIM')!.bytes.readUInt16LE(4)).toBe(0);
  const frames = chunks.filter(chunk => chunk.type === 'ANMF');
  expect(frames).toHaveLength(3);
  expect(frames.map(frame => frame.bytes.readUIntLE(12, 3))).toEqual([100, 100, 100]);
  expect(new Set(frames.map(frame => createHash('sha256').update(frame.bytes).digest('hex'))).size).toBe(3);
  const still = await getPngInfo(`assets/comail/wiggle/${name}.png`);
  expect(still.bpp).toBe(4);
  let transparent = 0;
  for (let i = 3; i < still.data.length; i += 4) if (still.data[i] === 0) transparent++;
  expect(transparent).toBeGreaterThan(0);
  expect([still.width, still.height]).toEqual([canvas.readUIntLE(4, 3) + 1, canvas.readUIntLE(7, 3) + 1]);
});
