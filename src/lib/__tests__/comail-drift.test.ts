import { beforeEach, expect, it, vi } from 'vitest';
import { Animated } from 'react-native';
import { startParticleDrift } from '../comail-drift';
const mocks = vi.hoisted(() => ({
  tail: { start: vi.fn(), stop: vi.fn() },
  loop: { start: vi.fn(), stop: vi.fn() },
  timing: vi.fn(), loopFactory: vi.fn(),
}));
vi.mock('react-native', () => ({ Animated: { timing: mocks.timing, loop: mocks.loopFactory }, Easing: { linear: (n: number) => n } }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.timing.mockReturnValue(mocks.tail);
  mocks.loopFactory.mockReturnValue(mocks.loop);
});

it('continues from the displayed frame without an opening or resume jump', () => {
  const phase = { setValue: vi.fn(), stopAnimation: vi.fn(callback => callback?.(0.25)) };
  const stop = startParticleDrift(phase as unknown as Animated.Value);
  expect(phase.setValue).not.toHaveBeenCalled();
  expect(mocks.timing).toHaveBeenCalledWith(phase, expect.objectContaining({ toValue: 1, duration: 27000, useNativeDriver: true }));
  mocks.tail.start.mock.calls[0][0]({ finished: true });
  expect(phase.setValue).toHaveBeenCalledWith(0);
  expect(mocks.loop.start).toHaveBeenCalledTimes(1);
  stop();
  expect(mocks.tail.stop).toHaveBeenCalled();
  expect(mocks.loop.stop).toHaveBeenCalled();
});

it('does not start late native callbacks after the artwork unmounts', () => {
  let ready: ((value: number) => void) | undefined;
  const phase = { setValue: vi.fn(), stopAnimation: vi.fn(callback => { if (callback) ready = callback; }) };
  const stop = startParticleDrift(phase as unknown as Animated.Value);
  stop();
  ready?.(0.4);
  expect(mocks.timing).not.toHaveBeenCalled();
});
