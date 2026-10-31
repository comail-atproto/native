import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { impactAsync } from 'expo-haptics';
import { createLeafHaptics } from '../leaf-haptics';

vi.mock('expo-haptics', () => ({ impactAsync: vi.fn(async () => undefined), ImpactFeedbackStyle: { Light: 'light' } }));
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); vi.mocked(impactAsync).mockClear(); });
afterEach(() => vi.useRealTimers());

it('only ticks when entering a visible leaf, once for a continuous touch', () => {
  const feedback = createLeafHaptics();
  feedback.touch(null, true);
  expect(impactAsync).not.toHaveBeenCalled();
  feedback.touch(1, true);
  vi.advanceTimersByTime(500);
  feedback.touch(1, true);
  expect(impactAsync).toHaveBeenCalledTimes(1);
  expect(impactAsync).toHaveBeenCalledWith('light');
  feedback.touch(null, true);
  feedback.touch(1, true);
  expect(impactAsync).toHaveBeenCalledTimes(2);
});

it('limits fast leaf crossings and respects the haptics switch', () => {
  const feedback = createLeafHaptics();
  feedback.touch(1, false);
  expect(impactAsync).not.toHaveBeenCalled();
  feedback.touch(2, true);
  feedback.touch(3, true);
  expect(impactAsync).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(300);
  feedback.touch(4, true);
  expect(impactAsync).toHaveBeenCalledTimes(2);
});

it('does not fail the interaction when hardware feedback is unavailable', async () => {
  vi.mocked(impactAsync).mockRejectedValueOnce(new Error('Haptics unavailable'));
  const feedback = createLeafHaptics();
  expect(() => feedback.touch(1, true)).not.toThrow();
  await Promise.resolve();
});
