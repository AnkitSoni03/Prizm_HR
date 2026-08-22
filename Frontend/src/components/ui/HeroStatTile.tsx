import type { ComponentType, ReactNode } from 'react';

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
 * StatTile so the other portals' tile layout stays untouched. */
export function HeroStatTile({ label, value, icon: Icon, accentColor, hint }: HeroStatTileProps) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border border-t-[3px] border-border bg-card p-2.5 shadow-xs transition-shadow hover:shadow-md sm:gap-3 sm:p-3.5"
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
  );
}
