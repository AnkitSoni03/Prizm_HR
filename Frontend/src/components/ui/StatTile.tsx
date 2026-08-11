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
  /** Optional secondary caption under the value, e.g. a breakdown or
   * timestamp — kept short, truncates rather than wraps. */
  hint?: string;
}

export function StatTile({ label, value, icon: Icon, tone = 'soft', accentColor, hint }: StatTileProps) {
  const iconStyle = accentColor
    ? tone === 'filled'
      ? { backgroundColor: accentColor, color: '#fff' }
      : { backgroundColor: `${accentColor}1f`, color: accentColor }
    : undefined;

  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] sm:p-5"
      style={accentColor ? { borderTopColor: accentColor, borderTopWidth: 2 } : undefined}
    >
      {accentColor && (
        <div
          className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-[0.08] transition-transform duration-300 group-hover:scale-110"
          style={{ backgroundColor: accentColor }}
        />
      )}
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-ink-muted sm:text-sm">{label}</p>
          <p className="mt-1.5 truncate text-xl font-bold tracking-tight text-ink sm:text-2xl">{value}</p>
          {hint && <p className="mt-1 truncate text-[11px] text-ink-muted sm:text-xs">{hint}</p>}
        </div>
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105 sm:h-10 sm:w-10 ${
            accentColor ? '' : tone === 'filled' ? 'bg-primary text-white' : 'bg-primary-light text-primary'
          }`}
          style={iconStyle}
        >
          <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={1.75} />
        </div>
      </div>
    </div>
  );
}

export function StatTileSkeleton() {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-6 w-14" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-9 w-9 shrink-0 rounded-lg sm:h-10 sm:w-10" />
    </div>
  );
}
