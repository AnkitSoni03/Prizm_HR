import type { ComponentType } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarCheck, ClipboardCheck, LayoutDashboard, User, Wallet } from 'lucide-react';

interface BottomNavTab {
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  path: string;
  /** Matches this path and everything under it (e.g. `/ess/leave/123`). */
  matchPrefixes: string[];
}

// Icons are picked to match navConfig.ts's ESS_NAV exactly — Dashboard,
// My Attendance, Team Approvals, My Payslips — so the same concept never
// shows a different glyph between this bar and the sidebar/drawer.
const TABS: BottomNavTab[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/ess', matchPrefixes: ['/ess'] },
  { label: 'Requests', icon: ClipboardCheck, path: '/ess/leave', matchPrefixes: ['/ess/leave', '/ess/od', '/ess/comp-off', '/ess/team-approvals'] },
  { label: 'Calendar', icon: CalendarCheck, path: '/ess/attendance', matchPrefixes: ['/ess/attendance'] },
  { label: 'Payslips', icon: Wallet, path: '/ess/payslips', matchPrefixes: ['/ess/payslips'] },
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
 * existing sidebar untouched. The full nav drawer is reachable only via the
 * Topbar's hamburger icon — this bar never opens it. */
export function BottomNav() {
  const { pathname } = useLocation();

  // "Dashboard" only claims the exact root — every other tab would
  // otherwise also start with "/ess" and light up two tabs at once.
  const dashboardActive = pathname === '/ess';

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 sm:hidden">
      <nav
        className="flex items-center justify-around rounded-t-3xl px-2 pt-2 shadow-lg"
        style={{ background: 'var(--banner-gradient)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
      >
        {TABS.map((tab) => {
          const active = tab.label === 'Dashboard' ? dashboardActive : isActive(pathname, tab.matchPrefixes);
          return (
            <Link
              key={tab.label}
              to={tab.path}
              className="flex min-w-[56px] flex-col items-center gap-1 rounded-2xl py-1 active:scale-95"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-xl text-white transition-colors ${
                  active ? 'bg-white/20' : ''
                }`}
              >
                <tab.icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.25 : 1.75} />
              </span>
              <span className={`text-[10px] text-white ${active ? 'font-semibold' : 'font-medium text-white/70'}`}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
