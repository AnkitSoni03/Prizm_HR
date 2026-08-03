import { CalendarDays } from 'lucide-react';
import { formatDisplayDate } from '../utils/dateDisplay';

const TODAY_LABEL = formatDisplayDate(
  new Date().toLocaleDateString('en-CA'), // en-CA gives YYYY-MM-DD in local time
);

interface DashboardHeaderProps {
  name: string;
  subtitle: string;
}

export function DashboardHeader({ name, subtitle }: DashboardHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5 sm:mb-6 sm:gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold tracking-tight text-ink sm:text-2xl">
          Welcome back, <span className="text-primary">{name}</span>!
        </h2>
        <p className="mt-0.5 text-xs text-ink-muted sm:mt-1 sm:text-sm">{subtitle}</p>
      </div>
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-ink-muted shadow-xs sm:gap-2 sm:px-3 sm:py-2 sm:text-sm">
        <CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
        {TODAY_LABEL}
      </div>
    </div>
  );
}
