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

/** ESS-dashboard-only "hero" stat card — a colorful, wave-decorated variant
 * of the shared StatTile used elsewhere. Kept local rather than folded into
 * StatTile so the other portals' tile layout stays untouched. */
export function HeroStatTile({ label, value, icon: Icon, accentColor, hint }: HeroStatTileProps) {
  return (
    <div
      className="group relative overflow-hidden rounded-xl border-l-[3px] border-y border-r border-border p-3 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:rounded-2xl sm:border-l-4 sm:p-5"
      style={{ backgroundColor: `${accentColor}0d`, borderLeftColor: accentColor }}
    >
      <div className="relative flex items-center gap-2 sm:gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105 sm:h-10 sm:w-10"
          style={{ backgroundColor: `${accentColor}1f`, color: accentColor }}
        >
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1.75} />
        </span>
        <span className="truncate text-xs font-medium text-ink-muted sm:text-sm">{label}</span>
      </div>

      <p className="relative mt-2 truncate text-xl font-bold tracking-tight sm:mt-3 sm:text-3xl" style={{ color: accentColor }}>
        {value}
      </p>

      {hint && <div className="relative mt-1 text-[11px] text-ink-muted sm:mt-1.5 sm:text-xs">{hint}</div>}

      <svg
        className="pointer-events-none absolute inset-x-0 bottom-0 h-6 w-full opacity-25 sm:h-9"
        viewBox="0 0 200 40"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M0,26 C20,8 40,36 60,20 C80,6 100,32 120,16 C140,4 160,26 180,12 C190,6 195,16 200,10"
          fill="none"
          stroke={accentColor}
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}
