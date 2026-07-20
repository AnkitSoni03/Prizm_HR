import { Building2 } from 'lucide-react';
import { EmptyStateCard } from '../../components/EmptyStateCard';

export function SuperAdminDashboard() {
  return (
    <EmptyStateCard
      icon={Building2}
      title="No groups or companies yet"
      description="Once you onboard your first Group or Company, key platform metrics will show up here."
    />
  );
}
