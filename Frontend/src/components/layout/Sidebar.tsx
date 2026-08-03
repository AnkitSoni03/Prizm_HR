import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { NavLink } from 'react-router-dom';
import type { NavItem } from '../../routes/navConfig';
import { useAuth } from '../../context/auth-context';

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
  const { hasPermission } = useAuth();
  const visibleNavItems = navItems.filter((item) => !item.permission || hasPermission(item.permission));

  // Resizable width only ever applies at desktop sizes (the "big display" the
  // user asked to customize) — mobile keeps its own slide-over drawer sizing
  // (w-[78vw] max-w-64 below) untouched, so this never fights that layout.
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
          'fixed inset-y-0 left-0 z-40 flex h-screen w-[78vw] max-w-64 shrink-0 flex-col bg-sidebar shadow-2xl ease-in-out',
          isDragging ? '' : 'transition-transform duration-200',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          // md:relative (not md:static) so the drag handle below — an
          // absolutely-positioned child — anchors to the sidebar's own right
          // edge instead of escaping to the nearest positioned ancestor.
          'md:relative md:max-w-none md:translate-x-0 md:shadow-none',
        ].join(' ')}
        style={isDesktop ? { width: `${width}px` } : undefined}
      >
        <div className="flex flex-col items-center gap-2 border-b border-white/10 px-5 py-5 text-center sm:py-6">
          <img src="/HRMS%20Logo.png" alt="HRMS logo" className="h-12 w-12 shrink-0 rounded-xl object-cover sm:h-14 sm:w-14" />
          <p className="truncate text-xs text-gray-400">{portalLabel}</p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;

            if (item.disabled) {
              return (
                <div
                  key={item.path}
                  className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-gray-600"
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
                    'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-nav-active text-white shadow-glow'
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

        <div className="border-t border-white/10 px-5 py-4">
          <p className="text-[11px] text-gray-500">© {new Date().getFullYear()} Sri Sai Group</p>
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
          className={[
            'absolute inset-y-0 right-0 z-10 hidden w-1.5 cursor-col-resize touch-none md:block',
            isDragging ? 'bg-primary' : 'bg-transparent hover:bg-primary/50',
          ].join(' ')}
        />
      </aside>
    </>
  );
}
