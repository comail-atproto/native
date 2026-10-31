export interface Rect { x: number; y: number; width: number; height: number }
export interface Point { x: number; y: number }
export interface Bounds { width: number; height: number }
export interface Particle { x: number; phase: number; size: number; rotation: number; opacity: number; sprite: number }

// The webmail's drift, sway, quiet regions and 110px repulsion, adapted to
// native interpolation tracks so React never renders on animation frames.
export function createParticles(bounds: Bounds): Particle[] {
  const count = Math.min(24, Math.max(12, Math.round(bounds.width * bounds.height / 24000)));
  const fraction = (n: number) => (n * 0.61803398875) % 1;
  return Array.from({ length: count }, (_, i) => ({
    x: fraction(i + 1), phase: fraction(i + 7), size: 28 + fraction(i + 3) * 28,
    rotation: fraction(i + 5) * 160 - 80, opacity: 0.22 + fraction(i + 2) * 0.22, sprite: i % 3,
  }));
}

export function particleFrame(p: Particle, progress: number, bounds: Bounds, quietRects: Rect[]) {
  const phase = progress % 1;
  const travel = bounds.height + 160;
  const x = p.x * bounds.width + Math.sin((phase + p.phase) * Math.PI * 2) * 16;
  const y = bounds.height + 80 - ((phase + p.phase) % 1) * travel;
  let quiet = 1;
  for (const rect of quietRects) {
    const padding = p.size / 2 + 8;
    const dx = Math.max(rect.x - padding - x, 0, x - rect.x - rect.width - padding);
    const dy = Math.max(rect.y - padding - y, 0, y - rect.y - rect.height - padding);
    quiet = Math.min(quiet, 0.06 + Math.min(1, Math.hypot(dx, dy) / 28) * 0.94);
  }
  const edge = Math.max(0, Math.min(1, (y + 60) / 40, (bounds.height + 60 - y) / 40));
  return { x, y, rotation: p.rotation + Math.sin(phase * Math.PI * 2) * 24, opacity: p.opacity * quiet * edge };
}

export function repelParticle(particle: Point, touch: Point): Point {
  const dx = particle.x - touch.x;
  const dy = particle.y - touch.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= 110) return { x: 0, y: 0 };
  if (distance < 0.001) return { x: 32, y: -32 };
  const force = (1 - distance / 110) * 64;
  return { x: dx / distance * force, y: dy / distance * force };
}

// Form controls stay quiet; artwork uses one hit area for motion and feedback.
export function particleTouches(frames: (Point & { opacity: number })[], touch: Point, quietRects: Rect[]) {
  if (quietRects.some(rect => touch.x >= rect.x && touch.x <= rect.x + rect.width
    && touch.y >= rect.y && touch.y <= rect.y + rect.height)) return [];
  return frames.flatMap((frame, index) => {
    const offset = repelParticle(frame, touch);
    return frame.opacity >= 0.05 && (offset.x !== 0 || offset.y !== 0)
      ? [{ index, offset, distance: Math.hypot(frame.x - touch.x, frame.y - touch.y) }] : [];
  }).sort((a, b) => a.distance - b.distance);
}

export function motionAllowed(enabled: boolean, reduced: boolean, state: string | null): boolean {
  return enabled && !reduced && state === 'active';
}
