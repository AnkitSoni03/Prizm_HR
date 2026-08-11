import type { Theme } from '../context/theme-context';

// Categorical slots validated with the dataviz skill's validate_palette.js
// against this app's actual card surfaces (#ffffff light / #17181d dark) —
// fixed hue order (blue, aqua, amber, violet), never reassigned per-series.
// Light mode's aqua/amber steps sit under 3:1 contrast by design (the
// "relief rule") — every chart that uses this palette ships a visible
// legend with direct labels rather than relying on color alone.
// status.* mirrors index.css's --success/--warning/--danger/--brand tokens —
// kept here as literal hex (rather than read from CSS vars) because Recharts
// <Cell fill> needs an actual color string, not a Tailwind class.
const light = {
  categorical: ['#2a78d6', '#1baf7a', '#eda100', '#4a3aa7'],
  grid: '#e5e7eb',
  mutedText: '#5a6b85',
  accent: '#3656c5',
  accentSoft: 'rgba(54, 86, 197, 0.14)',
  status: { success: '#059669', warning: '#d97706', danger: '#dc2626', info: '#3354a4' },
};

const dark = {
  categorical: ['#3987e5', '#199e70', '#c98500', '#9085e9'],
  grid: '#2a2c34',
  mutedText: '#9ca3af',
  accent: '#5478d0',
  accentSoft: 'rgba(84, 120, 208, 0.22)',
  status: { success: '#10b981', warning: '#fbbf24', danger: '#f87171', info: '#3354a4' },
};

export function getChartPalette(theme: Theme) {
  return theme === 'dark' ? dark : light;
}
