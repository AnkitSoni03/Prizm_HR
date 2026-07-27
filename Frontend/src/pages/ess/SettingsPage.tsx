import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs } from '../../components/ui/Tabs';
import { ChangePasswordCard } from '../../components/ChangePasswordCard';
import { DeviceRegistrationCard } from '../../components/DeviceRegistrationCard';
import { MyProfilePage } from './MyProfilePage';

type Tab = 'profile' | 'password' | 'device';

export function SettingsPage() {
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const initialTab: Tab = requestedTab === 'password' || requestedTab === 'device' ? requestedTab : 'profile';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  return (
    <div>
      <Tabs
        items={[
          { key: 'profile', label: 'Profile' },
          { key: 'password', label: 'Reset Password' },
          { key: 'device', label: 'Office Check-In Device' },
        ]}
        active={activeTab}
        onChange={(key) => setActiveTab(key as Tab)}
      />
      {activeTab === 'profile' && <MyProfilePage />}
      {activeTab === 'password' && <ChangePasswordCard />}
      {activeTab === 'device' && <DeviceRegistrationCard />}
    </div>
  );
}
