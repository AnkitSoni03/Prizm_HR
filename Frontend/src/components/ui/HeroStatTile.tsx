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
      className="group relative overflow-hidden rounded-xl border border-border p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-5"
      style={{ backgroundColor: `${accentColor}0d` }}
    >
      <div className="relative flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105"
          style={{ backgroundColor: `${accentColor}1f`, color: accentColor }}
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <span className="truncate text-sm font-medium text-ink-muted">{label}</span>
      </div>

      <p className="relative mt-3 truncate text-3xl font-bold tracking-tight" style={{ color: accentColor }}>
        {value}
      </p>

      {hint && <div className="relative mt-1.5 text-xs text-ink-muted">{hint}</div>}

      <svg
        className="pointer-events-none absolute inset-x-0 bottom-0 h-9 w-full opacity-25"
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
