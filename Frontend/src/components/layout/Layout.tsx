import { useState, type ReactNode } from 'react';
import type { NavItem } from '../../routes/navConfig';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomNav } from './BottomNav';
import { HolidayReminderModal } from '../HolidayReminderModal';
import { FaceIdReminderModal } from '../FaceIdReminderModal';

interface LayoutProps {
  navItems: NavItem[];
  portalLabel: string;
  title: string;
  children: ReactNode;
}

export function Layout({ navItems, portalLabel, title, children }: LayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // Only the employee portal gets the app-style bottom tab bar — every
  // other portal keeps the sidebar-only mobile nav it already had.
  const isEss = portalLabel === 'Employee Self-Service';

  return (
    <div className="flex h-dvh bg-page">
      <Sidebar
        navItems={navItems}
        portalLabel={portalLabel}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title={title} onOpenMobileMenu={() => setIsMobileMenuOpen(true)} navItems={navItems} />
        <main className={`flex-1 overflow-y-auto p-3 sm:p-4 md:p-8 ${isEss ? 'pb-28 sm:pb-4' : ''}`}>{children}</main>
      </div>
      {/* Hidden while the drawer is open — both sit at the same stacking
          layer as the drawer's own full-width mobile panel. */}
      {isEss && !isMobileMenuOpen && <BottomNav onOpenMore={() => setIsMobileMenuOpen(true)} />}
      <HolidayReminderModal />
      <FaceIdReminderModal />
    </div>
  );
}
