import { describe, expect, it } from 'vitest';
import { createParticles, particleFrame, repelParticle, particleTouches, motionAllowed } from '../comail-particles';

describe('Comail ambient artwork', () => {
  const bounds = { width: 390, height: 844 };
  it('keeps phone and tablet fields bounded and stable across renders', () => {
    const phone = createParticles(bounds);
    expect(phone).toEqual(createParticles(bounds));
    expect(phone.length).toBeGreaterThanOrEqual(12);
    expect(createParticles({ width: 1200, height: 1600 }).length).toBeLessThanOrEqual(24);
    for (const particle of phone) {
      for (const progress of [0, 0.25, 0.5, 0.99, 1]) {
        const frame = particleFrame(particle, progress, bounds, []);
        expect(frame.x).toBeGreaterThan(-80);
        expect(frame.x).toBeLessThan(bounds.width + 80);
        expect(frame.y).toBeGreaterThanOrEqual(-80);
        expect(frame.y).toBeLessThanOrEqual(bounds.height + 80);
      }
      expect(particleFrame(particle, 0, bounds, [])).toEqual(particleFrame(particle, 1, bounds, []));
    }
  });
  it('fades artwork beneath copy and form controls', () => {
    const particle = createParticles(bounds)[0];
    const frame = particleFrame(particle, 0.5, bounds, []);
    const quiet = particleFrame(particle, 0.5, bounds, [{ x: frame.x - 30, y: frame.y - 30, width: 60, height: 60 }]);
    expect(quiet.opacity).toBeLessThanOrEqual(frame.opacity * 0.1);
  });
  it('repels nearby artwork away from a finger, including a direct hit', () => {
    expect(repelParticle({ x: 60, y: 50 }, { x: 50, y: 50 }).x).toBeGreaterThan(0);
    expect(repelParticle({ x: 40, y: 50 }, { x: 50, y: 50 }).x).toBeLessThan(0);
    expect(repelParticle({ x: 200, y: 50 }, { x: 50, y: 50 })).toEqual({ x: 0, y: 0 });
    const direct = repelParticle({ x: 50, y: 50 }, { x: 50, y: 50 });
    expect(Number.isFinite(direct.x)).toBe(true);
    expect(Math.hypot(direct.x, direct.y)).toBeGreaterThan(0);
  });
  it('animates only while foregrounded, opted in and without reduced motion', () => {
    expect(motionAllowed(true, false, 'active')).toBe(true);
    expect(motionAllowed(false, false, 'active')).toBe(false);
    expect(motionAllowed(true, true, 'active')).toBe(false);
    expect(motionAllowed(true, true, 'background')).toBe(false);
    expect(motionAllowed(true, false, 'inactive')).toBe(false);
  });
});

// A leaf already moves away at this distance; its feedback must use the same hit.
it('uses the repulsion area for touches and chooses the nearest visible leaf', () => {
  const touch = { x: 50, y: 50 };
  const frames = [
    { x: 130, y: 50, opacity: 0.3 },
    { x: 90, y: 50, opacity: 0.3 },
    { x: 60, y: 50, opacity: 0.01 },
    { x: 200, y: 50, opacity: 0.3 },
  ];
  const hits = particleTouches(frames, touch, []);
  expect(hits.map(hit => hit.index)).toEqual([1, 0]);
  expect(hits[0].offset).toEqual(repelParticle(frames[1], touch));
  expect(particleTouches(frames, touch, [{ x: 40, y: 40, width: 30, height: 30 }])).toEqual([]);
});
