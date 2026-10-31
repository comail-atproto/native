import { expect, it, vi } from 'vitest';
vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { comailServices: true } } },
}));
import {
  supportsDeviceSync,
  supportsSideloadUpdates,
} from '../platform-capabilities';

it('keeps unported background sync and upstream APK installation out of Comail builds', () => {
  expect(supportsDeviceSync).toBe(false);
  expect(supportsSideloadUpdates).toBe(false);
});
