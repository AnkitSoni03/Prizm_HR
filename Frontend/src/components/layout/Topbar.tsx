import { LogOut, Menu, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import { useTheme } from '../../context/theme-context';
import { NotificationBell } from '../NotificationBell';
import { Avatar } from '../ui/Avatar';

interface TopbarProps {
  title: string;
  onOpenMobileMenu: () => void;
}

export function Topbar({ title, onOpenMobileMenu }: TopbarProps) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/95 px-3 shadow-xs backdrop-blur transition-colors duration-200 sm:h-16 sm:px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open menu"
          className="shrink-0 rounded-lg p-2 text-ink-muted transition-colors active:scale-95 hover:bg-page hover:text-ink md:hidden"
        >
          <Menu className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <h1 className="truncate text-sm font-semibold tracking-tight text-ink sm:text-base">{title}</h1>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2 md:gap-4">
        <NotificationBell />

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-page hover:text-ink"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" strokeWidth={1.75} /> : <Moon className="h-4 w-4" strokeWidth={1.75} />}
        </button>

        <div className="flex items-center gap-2.5">
          <Avatar src={user?.photoUrl} alt={user?.email} />
          <span className="hidden text-sm text-ink-muted sm:inline">{user?.email ?? 'Account'}</span>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-page hover:text-danger"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.75} />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
