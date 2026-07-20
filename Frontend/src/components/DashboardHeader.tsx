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
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          Welcome back, <span className="text-primary">{name}</span>!
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink-muted shadow-xs">
        <CalendarDays className="h-4 w-4" strokeWidth={1.75} />
        {TODAY_LABEL}
      </div>
    </div>
  );
}
