import { AlignLeft, ChevronDown, LogOut, Loader2, Moon, Search, Sun, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { NavItem } from '../../routes/navConfig';
import { useAuth } from '../../context/auth-context';
import { useTheme } from '../../context/theme-context';
import { NotificationBell } from '../NotificationBell';
import { Avatar } from '../ui/Avatar';

interface TopbarProps {
  title: string;
  onOpenMobileMenu: () => void;
  /** This portal's own nav list — powers the "Search anything…" box below
   * (filtered client-side, same permission gate Sidebar itself applies).
   * Optional so Topbar still renders fine anywhere it's used without one. */
  navItems?: NavItem[];
}

// A shade under a second so it registers as a real transition (session
// teardown feels intentional) without becoming an actual annoyance to wait
// through on every logout.
const LOGOUT_DELAY_MS = 700;

export function Topbar({ title, onOpenMobileMenu, navItems = [] }: TopbarProps) {
  const { user, hasPermission, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [query, setQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const searchableItems = navItems.filter(
    (item) => !item.disabled && (!item.permission || hasPermission(item.permission)),
  );
  const results =
    query.trim().length > 0
      ? searchableItems.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
      : [];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) setIsSearchFocused(false);
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setIsProfileOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function goToResult(path: string) {
    setQuery('');
    setIsSearchFocused(false);
    navigate(path);
  }

  function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setIsProfileOpen(false);
    setTimeout(() => {
      logout();
      navigate('/login', { replace: true });
    }, LOGOUT_DELAY_MS);
  }

  const displayName = user?.name ?? user?.email ?? 'Account';

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card/95 px-3 shadow-xs backdrop-blur transition-colors duration-200 sm:h-16 sm:gap-4 sm:px-4 md:px-6">
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open menu"
          className="shrink-0 rounded-lg p-2 text-ink-muted transition-colors active:scale-95 hover:bg-page hover:text-ink md:hidden"
        >
          <AlignLeft className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <h1 className="truncate text-[13px] font-semibold tracking-tight text-ink sm:text-base">{title}</h1>
      </div>

      {navItems.length > 0 && (
        <div ref={searchRef} className="relative hidden min-w-0 flex-1 sm:block sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" strokeWidth={1.75} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            placeholder="Search anything…"
            aria-label="Search navigation"
            className="w-full rounded-lg border border-border bg-page py-2 pl-9 pr-8 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-muted hover:bg-muted hover:text-ink"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          )}

          {isSearchFocused && query.trim().length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-border bg-card shadow-lg animate-[modal-in_150ms_cubic-bezier(0.16,1,0.3,1)]">
              {results.length === 0 ? (
                <p className="px-3.5 py-4 text-center text-sm text-ink-muted">No matches for &ldquo;{query}&rdquo;</p>
              ) : (
                results.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => goToResult(item.path)}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-ink transition-colors hover:bg-page"
                  >
                    <item.icon className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
                    {item.label}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 md:gap-3">
        <NotificationBell />

        {/* Theme toggle, profile, and logout move into the mobile Sidebar
            drawer below md — kept here only for desktop. */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="hidden rounded-lg p-2 text-ink-muted transition-colors hover:bg-page hover:text-ink md:block"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" strokeWidth={1.75} /> : <Moon className="h-4 w-4" strokeWidth={1.75} />}
        </button>

        <div ref={profileRef} className="relative hidden md:block">
          <button
            type="button"
            onClick={() => setIsProfileOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={isProfileOpen}
            className="flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-1.5 transition-colors hover:bg-page"
          >
            <Avatar src={user?.photoUrl} alt={displayName} />
            <span className="flex flex-col items-start leading-tight">
              <span className="text-sm font-semibold text-ink">{displayName}</span>
              {user?.designation && <span className="text-xs font-medium text-primary">{user.designation}</span>}
            </span>
            <ChevronDown
              className={['h-3.5 w-3.5 text-ink-muted transition-transform duration-150', isProfileOpen ? 'rotate-180' : ''].join(' ')}
              strokeWidth={1.75}
            />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-border bg-card py-1.5 shadow-lg animate-[modal-in_150ms_cubic-bezier(0.16,1,0.3,1)]">
              {user?.employeeId && (
                <Link
                  to="/ess/profile"
                  onClick={() => setIsProfileOpen(false)}
                  className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-ink transition-colors hover:bg-page"
                >
                  <UserRound className="h-4 w-4 text-ink-muted" strokeWidth={1.75} />
                  My Profile
                </Link>
              )}
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoggingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
                ) : (
                  <LogOut className="h-4 w-4" strokeWidth={1.75} />
                )}
                {isLoggingOut ? 'Logging out…' : 'Logout'}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
