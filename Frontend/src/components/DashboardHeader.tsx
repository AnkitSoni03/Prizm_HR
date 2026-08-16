import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { Avatar } from './ui/Avatar';

interface DashboardHeaderProps {
  name: string;
  subtitle: string;
  /** Extra subtitle text (e.g. department) appended after `subtitle` —
   * shown only from `sm:` up, so the mobile subtitle stays just `subtitle`. */
  subtitleDesktopExtra?: string;
  /** Optional status chip, paired with the date on the right (e.g. an
   * employee's active/on-notice state) — omit to leave just the date. */
  status?: { label: string; tone?: 'success' | 'neutral' };
}

export function DashboardHeader({ name, subtitle, subtitleDesktopExtra }: DashboardHeaderProps) {
  const { user } = useAuth();

  const avatar = (
    <Avatar
      src={user?.photoUrl}
      alt={name}
      size="lg"
      className="shrink-0 ring-2 ring-card transition-transform duration-150 group-hover:scale-105"
    />
  );

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-border bg-gradient-to-br from-primary-light to-card p-3.5 shadow-xs sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5">
      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3.5">
        {/* Same "clickable only if there's a profile to land on" convention
            as Topbar's own avatar — a pure admin account (no Employee record)
            renders the same block as a non-interactive span. */}
        {user?.employeeId ? (
          <Link to="/ess/profile" aria-label="View my profile" className="group shrink-0 rounded-full active:scale-95">
            {avatar}
          </Link>
        ) : (
          avatar
        )}
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold tracking-tight text-ink sm:text-2xl">
            <span className="hidden sm:inline">Welcome back, </span>
            <span className="text-primary">{name}</span>
          </h2>
          <p className="mt-0.5 truncate text-xs text-ink-muted sm:mt-1 sm:text-sm">
            {subtitle}
            {subtitleDesktopExtra && <span className="hidden sm:inline"> · {subtitleDesktopExtra}</span>}
          </p>
        </div>
      </div>
    </div>
  );
}
