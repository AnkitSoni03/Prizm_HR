import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs } from '../../components/ui/Tabs';
import { ChangePasswordCard } from '../../components/ChangePasswordCard';
import { MyProfilePage } from './MyProfilePage';

type Tab = 'profile' | 'password';

export function SettingsPage() {
  const [searchParams] = useSearchParams();
  const initialTab: Tab = searchParams.get('tab') === 'password' ? 'password' : 'profile';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  return (
    <div>
      <Tabs
        items={[
          { key: 'profile', label: 'Profile' },
          { key: 'password', label: 'Reset Password' },
        ]}
        active={activeTab}
        onChange={(key) => setActiveTab(key as Tab)}
      />
      {activeTab === 'profile' ? <MyProfilePage /> : <ChangePasswordCard />}
    </div>
  );
}
