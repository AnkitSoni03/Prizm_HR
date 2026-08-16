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
      className="group flex items-center gap-2.5 rounded-xl border-l-[3px] border-y border-r border-border p-2.5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:gap-3 sm:p-3.5"
      style={{ backgroundColor: `${accentColor}0d`, borderLeftColor: accentColor }}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105 sm:h-9 sm:w-9"
        style={{ backgroundColor: `${accentColor}1f`, color: accentColor }}
      >
        <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium text-ink-muted sm:text-xs">{label}</p>
        <p className="truncate text-base font-bold tracking-tight sm:text-lg" style={{ color: accentColor }}>
          {value}
        </p>
        {hint && <div className="text-[10px] text-ink-muted sm:text-[11px]">{hint}</div>}
      </div>
    </div>
  );
}
