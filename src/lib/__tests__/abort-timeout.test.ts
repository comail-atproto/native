import { AbortController as NativeAbortController, AbortSignal as NativeAbortSignal } from 'abort-controller';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { abortAfter } from '../abort-timeout';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('AbortController', NativeAbortController);
  vi.stubGlobal('AbortSignal', NativeAbortSignal);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each([10_000, 30_000])('aborts after %i ms using the actual React Native implementation', async (deadline) => {
  expect('timeout' in NativeAbortSignal).toBe(false);
  const signal = abortAfter(deadline);
  const aborted = vi.fn();
  signal.addEventListener('abort', aborted);
  await vi.advanceTimersByTimeAsync(deadline - 1);
  expect(signal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(signal.aborted).toBe(true);
  expect(aborted).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
