import { useEffect, useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/auth-context';
import { listGroups, listPlans, type Group, type Plan } from '../../api/tenancy';
import { GroupCard } from './components/GroupCard';
import { CreateGroupModal } from './components/CreateGroupModal';

export function CompaniesPage() {
  const { hasPermission } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Reused as the modals' onCreated callback (triggered from a click flow,
  // not an effect) to silently refresh the list after a create.
  async function loadGroups() {
    try {
      const [groupRows, planRows] = await Promise.all([listGroups(), listPlans()]);
      setGroups(groupRows);
      setPlans(planRows);
      setError(null);
    } catch {
      setError('Could not load groups. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  // Inlined rather than calling loadGroups() directly, so every setState
  // call is textually wrapped in a .then/.catch/.finally callback right
  // here — matching AuthContext's bootstrap effect. A bare call to a
  // function that sets state internally trips the set-state-in-effect lint
  // rule regardless of that function's own async structure.
  useEffect(() => {
    Promise.all([listGroups(), listPlans()])
      .then(([groupRows, planRows]) => {
        setGroups(groupRows);
        setPlans(planRows);
        setError(null);
      })
      .catch(() => setError('Could not load groups. Please try again.'))
      .finally(() => setIsLoading(false));
  }, []);

  const canCreateGroup = hasPermission('group:create');
  const canDeleteGroup = hasPermission('group:delete');
  const canEditGroup = hasPermission('group:update');

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Browse Groups and the Companies underneath them.
        </p>
        {canCreateGroup && (
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            New Group
          </Button>
        )}
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Loading groups…</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      {!isLoading && !error && groups.length === 0 && (
        <EmptyStateCard
          icon={Building2}
          title="No groups yet"
          description="Create the first Group to start onboarding Companies underneath it."
        />
      )}

      {!isLoading && groups.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              plans={plans}
              canDeleteGroup={canDeleteGroup}
              canEditGroup={canEditGroup}
              onDeleted={loadGroups}
              onSaved={loadGroups}
            />
          ))}
        </div>
      )}

      {isModalOpen && (
        <CreateGroupModal plans={plans} onClose={() => setIsModalOpen(false)} onCreated={loadGroups} />
      )}
    </div>
  );
}
