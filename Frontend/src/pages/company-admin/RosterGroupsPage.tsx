import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { AlignLeft, ChevronRight, LayoutGrid, Pencil, Plus, Trash2, UsersRound } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { SearchInput } from '../../components/ui/SearchInput';
import { FilterSelect } from '../../components/ui/FilterSelect';
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

function validityLabel(group: RosterPolicyGroup): string | null {
  if (!group.validityValue || !group.validityUnit) return null;
  return `${group.validityValue} ${group.validityUnit} validity`;
}

function RosterCardSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
          <div className="mt-3.5 border-t border-border pt-3.5">
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </>
  );
}

interface RosterCardProps {
  group: RosterPolicyGroup;
  onView: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function RosterCard({ group, onView, onEdit, onDelete }: RosterCardProps) {
  const validity = validityLabel(group);
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow duration-150 hover:shadow-md sm:p-5">
      <button type="button" onClick={onView} className="group flex w-full items-start gap-3 text-left">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
          <LayoutGrid className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          {validity && <Badge tone="neutral">{validity}</Badge>}
          <p className="mt-1 truncate text-[15px] font-semibold text-ink transition-colors group-hover:text-primary">
            {group.name}
          </p>
        </div>
        <ChevronRight
          className="mt-1.5 h-4 w-4 shrink-0 text-ink-muted transition-colors group-hover:text-primary"
          strokeWidth={1.75}
        />
      </button>

      <div className="mt-3.5 flex items-start gap-1.5 border-t border-border pt-3.5 text-xs text-ink-muted sm:text-sm">
        <AlignLeft className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
        <span className="line-clamp-2">{group.description || 'No description added.'}</span>
      </div>

      {(onEdit || onDelete) && (
        <div className="mt-3.5 flex items-center gap-2 border-t border-border pt-3">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${group.name}`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-page hover:text-ink"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
              Edit
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete ${group.name}`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
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
  const [search, setSearch] = useState('');
  const [validityFilter, setValidityFilter] = useState<'' | 'timed' | 'permanent'>('');

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

  const filteredGroups = useMemo(
    () =>
      rosterGroups.filter((g) => {
        const needle = search.trim().toLowerCase();
        const matchesSearch =
          !needle || g.name.toLowerCase().includes(needle) || (g.description ?? '').toLowerCase().includes(needle);
        const hasValidity = !!(g.validityValue && g.validityUnit);
        const matchesFilter = validityFilter === '' || (validityFilter === 'timed') === hasValidity;
        return matchesSearch && matchesFilter;
      }),
    [rosterGroups, search, validityFilter],
  );

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
      <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
            <LayoutGrid className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <p className="text-sm text-ink-muted">
            Create a Roster, then assign a Shift, region-specific Holidays, Company Policies, and a
            Leave Policy to it from each of those pages — assign employees to a Roster once instead
            of configuring each separately.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setEditingGroup('new')} className="shrink-0">
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Create Roster
          </Button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <SearchInput placeholder="Search rosters…" value={search} onChange={setSearch} />
        <FilterSelect
          value={validityFilter}
          onChange={(value) => setValidityFilter(value as typeof validityFilter)}
          placeholder="All rosters"
          ariaLabel="Filter by validity"
          options={[
            { value: 'timed', label: 'Has validity period' },
            { value: 'permanent', label: 'No expiry' },
          ]}
        />
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <RosterCardSkeleton />
        </div>
      )}

      {!isLoading && !error && filteredGroups.length === 0 && (
        <EmptyStateCard
          icon={UsersRound}
          title={rosterGroups.length === 0 ? 'No rosters yet!' : 'No rosters match your search'}
          description={
            rosterGroups.length === 0
              ? 'Create your first roster and manage employees more efficiently.'
              : 'Try a different search term or clear the filter.'
          }
          action={
            rosterGroups.length === 0 && canCreate ? (
              <Button onClick={() => setEditingGroup('new')}>
                <Plus className="h-4 w-4" strokeWidth={1.75} />
                Create Your First Roster
              </Button>
            ) : undefined
          }
        />
      )}

      {!isLoading && filteredGroups.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredGroups.map((g) => (
            <RosterCard
              key={g.id}
              group={g}
              onView={() => setViewingGroup(g)}
              onEdit={canUpdate ? () => setEditingGroup(g) : undefined}
              onDelete={canDelete ? () => handleDelete(g) : undefined}
            />
          ))}
        </div>
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
