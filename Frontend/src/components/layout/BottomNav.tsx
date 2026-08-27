import type { ComponentType } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calendar, FileText, LayoutGrid, MoreHorizontal, User } from 'lucide-react';

interface BottomNavTab {
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Omitted for the "More" tab, which opens the sidebar drawer instead of navigating. */
  path?: string;
  /** Matches this path and everything under it (e.g. `/ess/leave/123`). */
  matchPrefixes?: string[];
}

const TABS: BottomNavTab[] = [
  { label: 'Dashboard', icon: LayoutGrid, path: '/ess', matchPrefixes: ['/ess'] },
  { label: 'Requests', icon: FileText, path: '/ess/leave', matchPrefixes: ['/ess/leave', '/ess/od', '/ess/comp-off', '/ess/team-approvals'] },
  { label: 'Calendar', icon: Calendar, path: '/ess/attendance', matchPrefixes: ['/ess/attendance'] },
  { label: 'Profile', icon: User, path: '/ess/profile', matchPrefixes: ['/ess/profile'] },
];

function isActive(pathname: string, prefixes: string[] | undefined, exact?: boolean): boolean {
  if (!prefixes) return false;
  return prefixes.some((prefix) => {
    if (exact) return pathname === prefix;
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

/** ESS-only, mobile-only bottom tab bar — gives the phone dashboard a native
 * app feel alongside the mobile ID card / hero stat rows. Desktop keeps the
 * existing sidebar untouched; "More" reuses Layout's own mobile drawer
 * (the same one the Topbar hamburger opens) rather than a new overflow page,
 * so every other ESS nav item stays one tap away. */
export function BottomNav({ onOpenMore }: { onOpenMore: () => void }) {
  const { pathname } = useLocation();

  // "Dashboard" only claims the exact root — every other tab (and the
  // drawer-only pages behind "More") would otherwise also start with
  // "/ess" and light up two tabs at once.
  const dashboardActive = pathname === '/ess';
  const otherActive = TABS.slice(1).some((tab) => isActive(pathname, tab.matchPrefixes));
  const moreActive = !dashboardActive && !otherActive;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 sm:hidden">
      <nav
        className="flex items-center justify-around border-t border-border px-4 bg-card shadow-lg"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {TABS.map((tab) => {
          const active = tab.label === 'Dashboard' ? dashboardActive : isActive(pathname, tab.matchPrefixes);
          return (
            <Link
              key={tab.label}
              to={tab.path!}
              className="flex min-w-[56px] flex-col items-center gap-1 rounded-2xl py-1 active:scale-95"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                  active ? 'bg-primary-light text-primary' : 'text-ink-muted'
                }`}
              >
                <tab.icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.25 : 1.75} />
              </span>
              <span className={`text-[10px] ${active ? 'font-semibold text-primary' : 'font-medium text-ink-muted'}`}>
                {tab.label}
              </span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={onOpenMore}
          className="flex min-w-[56px] flex-col items-center gap-1 rounded-2xl py-1 active:scale-95"
        >
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
              moreActive ? 'bg-primary-light text-primary' : 'text-ink-muted'
            }`}
          >
            <MoreHorizontal className="h-[19px] w-[19px]" strokeWidth={moreActive ? 2.25 : 1.75} />
          </span>
          <span className={`text-[10px] ${moreActive ? 'font-semibold text-primary' : 'font-medium text-ink-muted'}`}>
            More
          </span>
        </button>
      </nav>
    </div>
  );
}
