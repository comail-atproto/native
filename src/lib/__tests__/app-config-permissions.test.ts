import { describe, expect, it } from 'vitest';

const app = require('../../../app.config.js').expo;

describe('native camera permissions', () => {
  it('keeps camera access available to the image picker with a purpose string', () => {
    const imagePicker = app.plugins.find(
      (plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-image-picker',
    ) as [string, { cameraPermission?: string | false; microphonePermission?: string | false }];

    expect(typeof imagePicker[1].cameraPermission).toBe('string');
    expect(String(imagePicker[1].cameraPermission).trim()).not.toBe('');
    expect(imagePicker[1].microphonePermission).toBe(false);
    expect(app.android.permissions).toContain('android.permission.CAMERA');
  });
});
