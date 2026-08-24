import { useEffect, useState } from 'react';
import axios from 'axios';
import { LayoutGrid, Pencil, Plus, Trash2 } from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useAuth } from '../../context/auth-context';
import { useConfirm } from '../../context/confirm-context';
import { useToast } from '../../context/toast-context';
import { deleteRosterGroup, listRosterGroups, type RosterPolicyGroup } from '../../api/companyAdmin/rosterGroups';
import { listEmployees } from '../../api/companyAdmin/employees';
import type { Employee } from '../../api/tenancy';
import { RosterGroupFormModal } from './components/RosterGroupFormModal';
import { RosterGroupDetailModal } from './components/RosterGroupDetailModal';

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
    return err.response.data.error;
  }
  return fallback;
}

// A Roster is just a name — a reusable label an employee is assigned to
// once. What it actually bundles (Shift, region-specific Holidays, Company
// Policies, Leave Policy overrides) is assigned FROM each of those entities'
// own create/edit forms ("Assign to Roster(s)"), not from here — see
// RosterGroupDetailModal for the read-only summary of what's linked.
// Unrelated to shift_rosters (the older per-date shift-override mechanism —
// same word, different concept). Its own admin UI was removed from
// ShiftsRostersPage for being confusable with this feature; shift_rosters
// itself is untouched and still takes priority at check-in time.
export function RosterGroupsPage() {
  const { hasPermission } = useAuth();
  const confirm = useConfirm();
  const showToast = useToast();
  const canCreate = hasPermission('roster_group:create');
  const canUpdate = hasPermission('roster_group:update');
  const canDelete = hasPermission('roster_group:delete');

  const [rosterGroups, setRosterGroups] = useState<RosterPolicyGroup[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<RosterPolicyGroup | 'new' | null>(null);
  const [viewingGroup, setViewingGroup] = useState<RosterPolicyGroup | null>(null);

  async function loadRosterGroups() {
    try {
      setRosterGroups(await listRosterGroups());
    } catch {
      setError('Could not load Rosters.');
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setError(null);
    Promise.all([listRosterGroups(), listEmployees({ limit: 100 })])
      .then(([groups, emp]) => {
        setRosterGroups(groups);
        setEmployees(emp.data);
      })
      .catch(() => setError('Could not load Rosters.'))
      .finally(() => setIsLoading(false));
  }, []);

  async function handleDelete(rosterGroup: RosterPolicyGroup) {
    const confirmed = await confirm({
      title: 'Delete Roster',
      message: `Delete "${rosterGroup.name}"? This cannot be undone, and only works if no employees, shift, holidays, or policies still reference it.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteRosterGroup(rosterGroup.id);
      loadRosterGroups();
    } catch (err) {
      showToast(extractError(err, 'Could not delete this Roster — it may still have employees, a shift, holidays, or policies assigned.'));
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <LayoutGrid className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
          Create a Roster, then assign a Shift, region-specific Holidays, Company Policies, and a
          Leave Policy to it from each of those pages — assign employees to a Roster once instead
          of configuring each separately.
        </p>
        {canCreate && (
          <Button onClick={() => setEditingGroup('new')}>
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Create Roster
          </Button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && !error && rosterGroups.length === 0 && (
        <EmptyStateCard
          icon={LayoutGrid}
          title="No Rosters yet"
          description='Create one per region or office — e.g. "Kolkata" — then assign a Shift, Holidays, and Policies to it, and assign employees.'
        />
      )}

      {(isLoading || rosterGroups.length > 0) && (
        <Table
          isLoading={isLoading}
          rows={rosterGroups}
          rowKey={(g) => g.id}
          columns={[
            {
              key: 'name',
              header: 'Name',
              render: (g) => (
                <button type="button" onClick={() => setViewingGroup(g)} className="font-medium text-primary hover:underline">
                  {g.name}
                </button>
              ),
            },
            { key: 'description', header: 'Description', render: (g) => g.description || '—' },
            {
              key: 'actions',
              header: '',
              className: 'w-24 text-right',
              render: (g) =>
                (canUpdate || canDelete) && (
                  <div className="flex justify-end gap-1">
                    {canUpdate && (
                      <button
                        type="button"
                        onClick={() => setEditingGroup(g)}
                        aria-label={`Edit ${g.name}`}
                        className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-ink"
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(g)}
                        aria-label={`Delete ${g.name}`}
                        className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                ),
            },
          ]}
        />
      )}

      {editingGroup && (
        <RosterGroupFormModal
          rosterGroup={editingGroup === 'new' ? undefined : editingGroup}
          onClose={() => setEditingGroup(null)}
          onSaved={loadRosterGroups}
        />
      )}

      {viewingGroup && (
        <RosterGroupDetailModal
          rosterGroup={viewingGroup}
          allEmployees={employees}
          onClose={() => setViewingGroup(null)}
          onUpdated={loadRosterGroups}
        />
      )}
    </div>
  );
}
