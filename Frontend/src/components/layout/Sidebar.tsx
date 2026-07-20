import { NavLink } from 'react-router-dom';
import type { NavItem } from '../../routes/navConfig';
import { useAuth } from '../../context/auth-context';

interface SidebarProps {
  navItems: NavItem[];
  portalLabel: string;
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ navItems, portalLabel, isOpen, onClose }: SidebarProps) {
  const { hasPermission } = useAuth();
  const visibleNavItems = navItems.filter((item) => !item.permission || hasPermission(item.permission));

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
          'fixed inset-y-0 left-0 z-40 flex h-screen w-64 shrink-0 flex-col bg-sidebar transition-transform duration-200 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'md:static md:translate-x-0',
        ].join(' ')}
      >
        <div className="flex flex-col items-center gap-2 px-5 py-6 text-center">
          <img src="/HRMS%20Logo.png" alt="HRMS logo" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
          <p className="truncate text-xs text-gray-400">{portalLabel}</p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;

            if (item.disabled) {
              return (
                <div
                  key={item.path}
                  className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2 text-sm text-gray-600"
                  title="Coming soon"
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
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
                    'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-nav-active text-white shadow-glow'
                      : 'text-gray-300 hover:translate-x-0.5 hover:bg-white/5 hover:text-white',
                  ].join(' ')
                }
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-5 py-4">
          <p className="text-[11px] text-gray-500">© {new Date().getFullYear()} Sri Sai Group</p>
        </div>
      </aside>
    </>
  );
}
