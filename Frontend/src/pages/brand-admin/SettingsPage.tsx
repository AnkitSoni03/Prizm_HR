import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, MonitorSmartphone, User } from 'lucide-react';
import { Tabs } from '../../components/ui/Tabs';
import { AccountProfileCard } from '../../components/AccountProfileCard';
import { ChangePasswordCard } from '../../components/ChangePasswordCard';
import { ScannerAccountsPage } from '../company-admin/ScannerAccountsPage';
import { useAuth } from '../../context/auth-context';

type Tab = 'profile' | 'password' | 'kiosks';

export function SettingsPage() {
  const { hasPermission } = useAuth();
  const canManageKiosks = hasPermission('scanner_account:create');

  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const initialTab: Tab =
    requestedTab === 'password' ? 'password' : requestedTab === 'kiosks' ? 'kiosks' : 'profile';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  return (
    <div>
      <Tabs
        items={[
          { key: 'profile', label: 'Profile', icon: User },
          { key: 'password', label: 'Reset Password', icon: Lock },
          ...(canManageKiosks ? [{ key: 'kiosks', label: 'Kiosk Accounts', icon: MonitorSmartphone }] : []),
        ]}
        active={activeTab}
        onChange={(key) => setActiveTab(key as Tab)}
      />
      {activeTab === 'profile' && <AccountProfileCard />}
      {activeTab === 'password' && <ChangePasswordCard />}
      {activeTab === 'kiosks' && canManageKiosks && <ScannerAccountsPage />}
    </div>
  );
}
