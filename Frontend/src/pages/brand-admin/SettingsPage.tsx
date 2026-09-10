import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, User } from 'lucide-react';
import { Tabs } from '../../components/ui/Tabs';
import { AccountProfileCard } from '../../components/AccountProfileCard';
import { ChangePasswordCard } from '../../components/ChangePasswordCard';

type Tab = 'profile' | 'password';

// Kiosk (Scanner) accounts are no longer managed here — provisioning them is
// Super Admin only, at Group level, from the Group detail page. See
// Backend/src/modules/attendance/officeKiosk.routes.js's requireSuperAdmin gate.
export function SettingsPage() {
  const [searchParams] = useSearchParams();
  const initialTab: Tab = searchParams.get('tab') === 'password' ? 'password' : 'profile';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  return (
    <div>
      <Tabs
        items={[
          { key: 'profile', label: 'Profile', icon: User },
          { key: 'password', label: 'Reset Password', icon: Lock },
        ]}
        active={activeTab}
        onChange={(key) => setActiveTab(key as Tab)}
      />
      {activeTab === 'profile' && <AccountProfileCard />}
      {activeTab === 'password' && <ChangePasswordCard />}
    </div>
  );
}
