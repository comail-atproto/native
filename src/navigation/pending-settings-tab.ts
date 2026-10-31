import { create } from 'zustand';

// A `settings/<tab>` deep link arrives before SettingsScreen is mounted (or
// while it shows the list). The tab id is parked here and consumed by
// SettingsScreen on its next render.
interface PendingSettingsTabState {
  tab: string | null;
  set: (tab: string | null) => void;
  consume: () => string | null;
}

export const usePendingSettingsTab = create<PendingSettingsTabState>((set, get) => ({
  tab: null,
  set: (tab) => set({ tab }),
  consume: () => {
    const tab = get().tab;
    if (tab) set({ tab: null });
    return tab;
  },
}));

export function setPendingSettingsTab(tab: string | null): void {
  usePendingSettingsTab.getState().set(tab);
}
