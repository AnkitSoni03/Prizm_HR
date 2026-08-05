import type { ReactNode } from 'react';
import { useTheme } from '../context/theme-context';
import { getChartPalette } from '../utils/chartColors';

// Soft-tint pill in a single fixed hue (the app's first categorical color —
// see chartColors.ts) for every row, not one rotating per row. Used to make
// a list of named entities (e.g. holiday names) easier to scan than a
// column of plain text, without introducing any new, unvalidated colors.
export function ColorTag({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const palette = getChartPalette(theme);
  const color = palette.categorical[0];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: `${color}1f`, color }}
    >
      {children}
    </span>
  );
}

// Same soft-pill treatment but always the app's single accent hue (not
// rotating) — for a count/measure rather than a named category, e.g. "3
// Days".
export function AccentTag({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const palette = getChartPalette(theme);
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: palette.accentSoft, color: palette.accent }}
    >
      {children}
    </span>
  );
}
