import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { GripVertical, LogOut, Loader2, Moon, Sun, X } from 'lucide-react';
import type { NavItem } from '../../routes/navConfig';
import { useAuth } from '../../context/auth-context';
import { useTheme } from '../../context/theme-context';

// A shade under a second so it registers as a real transition (session
// teardown feels intentional) without becoming an actual annoyance to wait
// through on every logout — mirrors Topbar's own delay for the desktop path.
const LOGOUT_DELAY_MS = 700;

interface SidebarProps {
  navItems: NavItem[];
  portalLabel: string;
  isOpen: boolean;
  onClose: () => void;
}

const STORAGE_KEY = 'hrms:sidebarWidth';
const DEFAULT_WIDTH = 256;
const MIN_WIDTH = 208;
const MAX_WIDTH = 420;
const DESKTOP_QUERY = '(min-width: 768px)';

function clampWidth(width: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

function readStoredWidth(): number {
  const stored = Number(window.localStorage.getItem(STORAGE_KEY));
  return stored ? clampWidth(stored) : DEFAULT_WIDTH;
}

export function Sidebar({ navItems, portalLabel, isOpen, onClose }: SidebarProps) {
  const { hasPermission, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const visibleNavItems = navItems.filter((item) => !item.permission || hasPermission(item.permission));

  function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setTimeout(() => {
      logout();
      onClose();
      navigate('/login', { replace: true });
    }, LOGOUT_DELAY_MS);
  }

  // Resizable width only ever applies at desktop sizes (the "big display" the
  // user asked to customize) — mobile keeps its own full-width slide-over
  // drawer (w-full below) untouched, so this never fights that layout.
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? DEFAULT_WIDTH : readStoredWidth()));
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches,
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const widthRef = useRef(width);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const handleChange = () => setIsDesktop(mql.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    dragRef.current = { startX: event.clientX, startWidth: width };
    setIsDragging(true);
    document.body.style.userSelect = 'none';
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    setWidth(clampWidth(dragRef.current.startWidth + (event.clientX - dragRef.current.startX)));
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    setIsDragging(false);
    document.body.style.userSelect = '';
    window.localStorage.setItem(STORAGE_KEY, String(widthRef.current));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleDoubleClick() {
    setWidth(DEFAULT_WIDTH);
    window.localStorage.setItem(STORAGE_KEY, String(DEFAULT_WIDTH));
  }

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 transition-opacity md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 flex h-screen w-full shrink-0 flex-col bg-sidebar shadow-2xl ease-in-out',
          isDragging ? '' : 'transition-transform duration-200',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          // md:relative (not md:static) so the drag handle below — an
          // absolutely-positioned child — anchors to the sidebar's own right
          // edge instead of escaping to the nearest positioned ancestor.
          // Full-width only applies below md — the resizable desktop rail
          // (width set inline below) takes back over at md and up.
          'md:relative md:w-auto md:max-w-none md:translate-x-0 md:shadow-none',
        ].join(' ')}
        style={isDesktop ? { width: `${width}px` } : undefined}
      >
        <div className="relative flex flex-col items-center gap-1.5 border-b border-white/10 px-5 py-4 text-center sm:gap-2 sm:py-5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400 transition-colors active:scale-95 hover:bg-white/10 hover:text-white md:hidden"
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
          <img src="/HRMS%20Logo.png" alt="HRMS logo" className="h-16 w-16 shrink-0 rounded-xl object-cover sm:h-20 sm:w-20" />
          <p className="truncate text-[11px] text-gray-400 sm:text-xs">{portalLabel}</p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;

            if (item.disabled) {
              return (
                <div
                  key={item.path}
                  className="flex cursor-not-allowed items-center gap-3 rounded-xl border-b border-white/10 px-3 py-2 text-[13px] text-gray-600 last:border-b-0 sm:py-2.5 sm:text-sm"
                  title="Coming soon"
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span className="flex-1 truncate">{item.label}</span>
                  <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                    Soon
                  </span>
                </div>
              );
            }

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end
                onClick={onClose}
                className={({ isActive }) =>
                  [
                    'relative flex items-center gap-3 rounded-xl border-b border-white/10 px-3 py-2 text-[13px] font-medium transition-all duration-150 last:border-b-0 sm:py-2.5 sm:text-sm',
                    isActive
                      ? 'bg-nav-active text-white'
                      : 'text-gray-300 hover:translate-x-0.5 hover:bg-white/5 hover:text-white active:scale-[0.98]',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-white" />
                    )}
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                    <span className="truncate">{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Mobile-only quick actions — theme toggle + logout live in the
            Topbar on desktop; folded in here so the drawer is fully
            self-contained on mobile. */}
        <div className="space-y-2 border-t border-white/10 px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex w-full items-center justify-between rounded-xl bg-white/5 px-3.5 py-2.5 text-[13px] font-medium text-gray-200 transition-colors hover:bg-white/10"
          >
            <span className="flex items-center gap-2.5">
              {theme === 'dark' ? (
                <Moon className="h-4 w-4 text-primary" strokeWidth={1.75} />
              ) : (
                <Sun className="h-4 w-4 text-amber-400" strokeWidth={1.75} />
              )}
              Dark mode
            </span>
            {/* Sliding pill switch — circle travels left/right on toggle. */}
            <span
              className={[
                'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200',
                theme === 'dark' ? 'bg-primary' : 'bg-white/15',
              ].join(' ')}
            >
              <span
                className={[
                  'inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out',
                  theme === 'dark' ? 'translate-x-[22px]' : 'translate-x-1',
                ].join(' ')}
              />
            </span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px] font-medium text-gray-300 transition-colors hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoggingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
            ) : (
              <LogOut className="h-4 w-4" strokeWidth={1.75} />
            )}
            {isLoggingOut ? 'Logging out…' : 'Logout'}
          </button>
        </div>

        <div className="border-t border-white/10 px-5 py-3">
          <p className="text-[10px] text-gray-500 sm:text-[11px]">© {new Date().getFullYear()} Sri Sai Group</p>
        </div>

        {/* Desktop-only drag-to-resize handle — double-click resets to the default width. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={handleDoubleClick}
          className="group absolute inset-y-0 right-0 z-10 hidden w-2.5 cursor-col-resize touch-none items-center justify-center md:flex"
        >
          {/* Always-visible line on the sidebar's own border — not just on
              hover/drag — so it reads as adjustable at a glance. */}
          <span
            className={[
              'absolute inset-y-0 right-0 w-px transition-colors duration-150',
              isDragging ? 'bg-primary' : 'bg-white/15 group-hover:bg-primary/70',
            ].join(' ')}
          />
          {/* Grip affordance, centered vertically, hinting the edge can be
              dragged left/right to resize. */}
          <span
            className={[
              'relative flex h-9 w-2.5 items-center justify-center rounded-full transition-colors duration-150',
              isDragging ? 'bg-primary' : 'bg-white/10 group-hover:bg-primary/70',
            ].join(' ')}
          >
            <GripVertical
              className={[
                'h-3.5 w-3.5 transition-colors duration-150',
                isDragging ? 'text-white' : 'text-gray-400 group-hover:text-white',
              ].join(' ')}
              strokeWidth={2}
            />
          </span>
        </div>
      </aside>
    </>
  );
}
