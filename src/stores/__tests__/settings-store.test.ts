import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../api/identity', () => ({ getIdentities: vi.fn(async () => []) }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useSettingsStore,
  mergeWithDefaults,
  toExportShape,
  fromExportShape,
} from '../settings-store';

describe('settings-store', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useSettingsStore.getState().resetToDefaults();
  });

  describe('defaults', () => {
    it('match the webmail where behaviour is identical', () => {
      const s = useSettingsStore.getState();
      expect(s.includeGroupInUnified).toBe(true);
      expect(s.autoSelectReplyIdentity).toBe(false);
      expect(s.replyIdentityMatch).toBe('domain');
      expect(s.showBirthdayCalendar).toBe(false);
      expect(s.attachmentReminderKeywords).toContain('anhang');
      expect(s.attachmentReminderKeywords).toContain('添付');
    });
  });

  describe('mergeWithDefaults', () => {
    it('restores the haptic feedback preference', () => {
      expect(mergeWithDefaults({ hapticsEnabled: false }).hapticsEnabled).toBe(false);
      expect(mergeWithDefaults({}).hapticsEnabled).toBe(true);
    });

    it('restores a saved colour theme and preserves the default choice', () => {
      expect(mergeWithDefaults({ activeThemeId: 'builtin-nord' }).activeThemeId).toBe('builtin-nord');
      expect(mergeWithDefaults({ activeThemeId: null }).activeThemeId).toBeNull();
    });

    it('moves a saved holiday app theme back to Comail without resetting preferences', () => {
      const settings = mergeWithDefaults({ activeThemeId: 'builtin-comail-spooky', theme: 'light', hapticsEnabled: false });
      expect(settings.activeThemeId).toBeNull();
      expect(settings.theme).toBe('light');
      expect(settings.hapticsEnabled).toBe(false);
    });

    it('rejects values outside the allowed set', () => {
      const out = mergeWithDefaults({
        density: 'x' as never,
        swipeLeftAction: 'foo' as never,
        sendDelaySeconds: 17,
        emailsPerPage: -4,
        theme: 'dark',
      });
      expect(out.density).toBe('regular');
      expect(out.swipeLeftAction).toBe('archive');
      expect(out.sendDelaySeconds).toBe(0);
      expect(out.emailsPerPage).toBe(25);
      expect(out.theme).toBe('dark');
    });

    it('keeps valid values and normalises the quick-action bar', () => {
      const out = mergeWithDefaults({
        sendDelaySeconds: 30,
        bottomQuickActions: ['delete', 'delete', 'bogus' as never],
      });
      expect(out.sendDelaySeconds).toBe(30);
      expect(out.bottomQuickActions).toEqual(['delete', 'reply', 'replyAll']);
    });

    it('accepts only the known reply identity match modes', () => {
      expect(mergeWithDefaults({ replyIdentityMatch: 'exact' }).replyIdentityMatch).toBe('exact');
      expect(mergeWithDefaults({ replyIdentityMatch: 'loose' as never }).replyIdentityMatch).toBe('domain');
    });

    it('drops legacy debug preferences but keeps supported settings', () => {
      const out = mergeWithDefaults({
        debugMode: true,
        debugCategories: { push: false },
        density: 'compact',
      } as never) as unknown as Record<string, unknown>;
      expect(out.density).toBe('compact');
      expect(out).not.toHaveProperty('debugMode');
      expect(out).not.toHaveProperty('debugCategories');
    });
  });

  describe('trusted senders', () => {
    it('strips a display name in angle form', () => {
      const s = useSettingsStore.getState();
      s.addTrustedSender('Alice Example <Alice@Example.com>');
      expect(useSettingsStore.getState().trustedSenders).toEqual(['alice@example.com']);
      expect(useSettingsStore.getState().isSenderTrusted('alice@example.com')).toBe(true);
      expect(useSettingsStore.getState().isSenderTrusted('"Alice" <ALICE@example.com>')).toBe(true);
      useSettingsStore.getState().removeTrustedSender('Alice <alice@example.com>');
      expect(useSettingsStore.getState().trustedSenders).toEqual([]);
    });
  });

  describe('export / import', () => {
    it('renames keys to the webmail names and drops device-local keys', () => {
      const shape = toExportShape({
        ...useSettingsStore.getState(),
        calendarFirstDayOfWeek: 0,
        emailExportTemplate: 'x',
        swipeMode: 'reveal',
      } as never);
      expect(shape.firstDayOfWeek).toBe(0);
      expect(shape.emailDownloadTemplate).toBe('x');
      expect(shape).not.toHaveProperty('calendarFirstDayOfWeek');
      expect(shape).not.toHaveProperty('swipeMode');
      expect(shape).not.toHaveProperty('offlineCacheDays');
    });

    it('imports a webmail export, ignoring unknown and invalid keys', () => {
      const ok = useSettingsStore.getState().importSettings(JSON.stringify({
        firstDayOfWeek: 0,
        density: 'compact',
        sendDelaySeconds: 99,
        messageListOrder: [{ property: 'receivedAt' }],
        swipeMode: 'reveal',
        unknownKey: 'whatever',
      }));
      expect(ok).toBe(true);
      const s = useSettingsStore.getState();
      expect(s.calendarFirstDayOfWeek).toBe(0);
      expect(s.density).toBe('compact');
      expect(s.sendDelaySeconds).toBe(0);
      expect(s.swipeMode).toBe('instant');
    });

    it('round-trips through exportSettings', () => {
      useSettingsStore.getState().updateSetting('fontSize', 'large');
      const json = useSettingsStore.getState().exportSettings();
      useSettingsStore.getState().resetToDefaults();
      expect(useSettingsStore.getState().fontSize).toBe('medium');
      expect(useSettingsStore.getState().importSettings(json)).toBe(true);
      expect(useSettingsStore.getState().fontSize).toBe('large');
    });

    it('rejects non-object JSON', () => {
      expect(useSettingsStore.getState().importSettings('[1,2]')).toBe(false);
      expect(useSettingsStore.getState().importSettings('not json')).toBe(false);
    });

    it('fromExportShape maps webmail names back', () => {
      expect(fromExportShape({ expandedFilterView: true, filenameLowercase: true })).toEqual({
        filtersExpandedView: true,
        exportLowercase: true,
      });
    });
  });

  describe('resetToDefaults', () => {
    it('restores every persisted key', () => {
      const s = useSettingsStore.getState();
      s.updateSetting('density', 'compact');
      s.addTrustedSender('x@y.z');
      useSettingsStore.getState().resetToDefaults();
      const after = useSettingsStore.getState();
      expect(after.density).toBe('regular');
      expect(after.trustedSenders).toEqual([]);
    });
  });
});
