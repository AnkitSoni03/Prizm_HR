import { CalendarDays } from 'lucide-react';
import { formatDisplayDate } from '../utils/dateDisplay';

const TODAY_LABEL = formatDisplayDate(
  new Date().toLocaleDateString('en-CA'), // en-CA gives YYYY-MM-DD in local time
);

interface DashboardHeaderProps {
  name: string;
  subtitle: string;
  /** Optional status chip appended after the subtitle (e.g. an employee's
   * active/on-notice state) — omit to leave the header exactly as before. */
  status?: { label: string; tone?: 'success' | 'neutral' };
}

export function DashboardHeader({ name, subtitle, status }: DashboardHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5 sm:mb-6 sm:gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold tracking-tight text-ink sm:text-2xl">
          Welcome back, <span className="text-primary">{name}</span>  ! <span aria-hidden="true">👋</span>
        </h2>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-muted sm:mt-1 sm:text-sm">
          <span>{subtitle}</span>
          {status && (
            <span
              className={`inline-flex items-center gap-1 font-medium ${
                status.tone === 'neutral' ? 'text-ink-muted' : 'text-success'
              }`}
            >
              · <span className={`h-1.5 w-1.5 rounded-full ${status.tone === 'neutral' ? 'bg-ink-muted' : 'bg-success'}`} />
              {status.label}
            </span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-ink-muted shadow-xs sm:gap-2 sm:px-3 sm:py-2 sm:text-sm">
        <CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
        {TODAY_LABEL}
      </div>
    </div>
  );
}
