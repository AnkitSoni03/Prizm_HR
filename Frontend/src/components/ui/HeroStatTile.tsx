import type { ComponentType, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

interface HeroStatTileProps {
  label: string;
  value: string | number;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Hex accent — drives the icon chip, the value color, and the
   * decorative wave. */
  accentColor: string;
  /** Optional secondary line under the value — a plain string or a small
   * custom node (e.g. a two-line holiday name + date block). */
  hint?: ReactNode;
}

/** ESS-dashboard-only "hero" stat card — a colorful, compact variant of the
 * shared StatTile used elsewhere. Kept local rather than folded into
 * StatTile so the other portals' tile layout stays untouched. Renders two
 * markups: a full-width tinted row (mobile) and the original bordered tile
 * (sm: and up) — the row shape doesn't scale up cleanly to a multi-column
 * grid, so rather than one shared markup this swaps wholesale at the
 * breakpoint, same as EssDashboard's mobile ID card / desktop banner split. */
export function HeroStatTile({ label, value, icon: Icon, accentColor, hint }: HeroStatTileProps) {
  return (
    <>
      <div
        className="flex items-center gap-3 rounded-2xl p-4 shadow-xs sm:hidden"
        style={{ backgroundColor: `${accentColor}14` }}
      >
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${accentColor}2e`, color: accentColor }}
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-ink-muted">{label}</p>
          <p className="truncate text-xl font-bold tracking-tight" style={{ color: accentColor }}>
            {value}
          </p>
          {hint && <div className="text-[11px] text-ink-muted">{hint}</div>}
        </div>
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${accentColor}2e`, color: accentColor }}
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </span>
      </div>

      <div
        className="hidden items-center gap-2.5 rounded-xl border border-t-[3px] border-border bg-card p-2.5 shadow-xs transition-shadow hover:shadow-md sm:flex sm:gap-3 sm:p-3.5"
        style={{ borderTopColor: accentColor }}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10"
          style={{ backgroundColor: `${accentColor}1f`, color: accentColor }}
        >
          <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-ink-muted sm:text-xs">{label}</p>
          <p className="truncate text-base font-bold tracking-tight text-ink sm:text-lg">{value}</p>
          {hint && <div className="text-[10px] text-ink-muted sm:text-[11px]">{hint}</div>}
        </div>
      </div>
    </>
  );
}
