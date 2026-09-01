import type { ComponentType, ReactNode } from 'react';

interface DetailRowProps {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: ReactNode;
}

// A label/value line for an entity-card body (icon + muted label on the
// left, the value right-aligned) — shared by every card-style list page
// (Organization's Brands, Shifts) so the look stays consistent.
export function DetailRow({ icon: Icon, label, value }: DetailRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs sm:text-sm">
      <span className="flex items-center gap-1.5 text-ink-muted">
        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
        {label}
      </span>
      <span className="truncate text-right font-medium text-ink">{value}</span>
    </div>
  );
}
