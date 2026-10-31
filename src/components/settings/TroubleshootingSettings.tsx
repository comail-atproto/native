import React, { useState } from 'react';
import { Alert } from 'react-native';
import { SettingsSection, SettingItem } from './settings-section';
import Button from '../Button';
import { useLocaleStore } from '../../stores/locale-store';
import { clearCachedData } from '../../lib/clear-cached-data';

/** Settings → Storage & backup → Troubleshooting: refresh cached server data. */
export function TroubleshootingSettings() {
  const t = useLocaleStore((s) => s.t);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefreshCache = async () => {
    setRefreshing(true);
    try {
      await clearCachedData();
    } catch (err) {
      Alert.alert(
        t('settings.advanced.refresh_cache.label', 'Refresh cached data'),
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SettingsSection
      title={t('settings.troubleshooting.cache_title', 'Cached data')}
      description={t('settings.troubleshooting.cache_desc', 'When a list looks stale or wrong.')}
    >
      <SettingItem
        label={t('settings.advanced.refresh_cache.label', 'Refresh cached data')}
        description={t(
          'settings.advanced.refresh_cache.description',
          'Reload contacts, calendars, and folders from the server. Keeps your accounts and sessions — fixes a stale or wrong view without signing out.',
        )}
        noBorder
      >
        <Button variant="outline" size="sm" onPress={() => void handleRefreshCache()} loading={refreshing}>
          {t('settings.advanced.refresh_cache.button', 'Refresh')}
        </Button>
      </SettingItem>
    </SettingsSection>
  );
}
