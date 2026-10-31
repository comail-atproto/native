import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';

export function createLeafHaptics() {
  let lastLeaf: number | null = null;
  let lastPulse = -Infinity;
  return {
    touch(leaf: number | null, enabled: boolean): void {
      const entered = leaf !== null && leaf !== lastLeaf;
      lastLeaf = leaf;
      if (!entered || !enabled || Date.now() - lastPulse < 250) return;
      lastPulse = Date.now();
      void impactAsync(ImpactFeedbackStyle.Light).catch(() => undefined);
    },
  };
}
