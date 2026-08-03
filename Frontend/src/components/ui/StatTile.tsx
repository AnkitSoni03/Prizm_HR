import type { ComponentType } from 'react';
import { Skeleton } from './Skeleton';

type StatTileTone = 'soft' | 'filled';

interface StatTileProps {
  label: string;
  value: string | number;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  /** 'soft' (tinted circle, default) alternates with 'filled' (solid brand
   * circle, white icon) across a tile row for the same visual rhythm as
   * docs/dark-theme-example.png's stat cards. */
  tone?: StatTileTone;
  /** Optional explicit icon color override — hex string, e.g. from the
   * theme-aware categorical chart palette (utils/chartColors.ts) — for
   * pages that want per-tile color variety instead of the single-brand-hue
   * soft/filled default. Omit to keep existing behavior untouched. */
  accentColor?: string;
}

export function StatTile({ label, value, icon: Icon, tone = 'soft', accentColor }: StatTileProps) {
  const iconStyle = accentColor
    ? tone === 'filled'
      ? { backgroundColor: accentColor, color: '#fff' }
      : { backgroundColor: `${accentColor}1f`, color: accentColor }
    : undefined;

  return (
    <div className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] sm:gap-4 sm:p-5">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 sm:h-11 sm:w-11 ${
          accentColor ? '' : tone === 'filled' ? 'bg-primary text-white' : 'bg-primary-light text-primary'
        }`}
        style={iconStyle}
      >
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xl font-semibold tracking-tight text-ink sm:text-2xl">{value}</p>
        <p className="truncate text-xs text-ink-muted sm:text-sm">{label}</p>
      </div>
    </div>
  );
}

export function StatTileSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-xs sm:gap-4 sm:p-5">
      <Skeleton className="h-10 w-10 shrink-0 rounded-xl sm:h-11 sm:w-11" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-6 w-12" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}
