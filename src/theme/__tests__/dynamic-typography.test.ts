import { expect, it, vi } from 'vitest';
import { typography } from '../tokens';

vi.mock('react', () => ({ useMemo: (build: () => unknown) => build() }));
vi.mock('../../stores/settings-store', () => ({
  useSettingsStore: (select: (settings: { fontSize: string }) => unknown) => select({ fontSize: 'large' }),
}));

it('preserves Comail font families when larger app text is selected', async () => {
  const { useTypography } = await import('../dynamic');
  const scaled = useTypography();
  expect(scaled.h1.fontFamily).toBe(typography.h1.fontFamily);
  expect(scaled.body.fontFamily).toBe(typography.body.fontFamily);
  expect(scaled.bodyBold.fontFamily).toBe(typography.bodyBold.fontFamily);
  expect(scaled.body.fontSize).toBeGreaterThan(typography.body.fontSize);
});
