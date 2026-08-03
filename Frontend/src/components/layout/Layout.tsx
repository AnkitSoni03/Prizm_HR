import { useState, type ReactNode } from 'react';
import type { NavItem } from '../../routes/navConfig';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { HolidayReminderModal } from '../HolidayReminderModal';

interface LayoutProps {
  navItems: NavItem[];
  portalLabel: string;
  title: string;
  children: ReactNode;
}

export function Layout({ navItems, portalLabel, title, children }: LayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-page">
      <Sidebar
        navItems={navItems}
        portalLabel={portalLabel}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title={title} onOpenMobileMenu={() => setIsMobileMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-8">{children}</main>
      </div>
      <HolidayReminderModal />
    </div>
  );
}
