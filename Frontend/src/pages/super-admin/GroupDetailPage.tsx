import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useAuth } from '../../context/auth-context';
import { useConfirm } from '../../context/confirm-context';
import { useToast } from '../../context/toast-context';
import { CreateCompanyModal } from './components/CreateCompanyModal';
import { EditGroupModal } from './components/EditGroupModal';
import { CompanyCard } from './components/CompanyCard';
import {
  deleteGroup,
  listCompanies,
  listGroups,
  listPlans,
  type Company,
  type Group,
  type Plan,
} from '../../api/tenancy';

// Mirrors CompanyDetailPage's shape one level up the hierarchy: a Group's
// own summary header, then the Companies underneath it as the same card
// grid CompanyCard already renders elsewhere.
export function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const confirm = useConfirm();
  const showToast = useToast();

  const [group, setGroup] = useState<Group | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const canCreateCompany = hasPermission('company:create');
  const canDeleteCompany = hasPermission('company:delete');
  const canEditCompany = hasPermission('company:update');
  const canEditGroup = hasPermission('group:update');
  const canDeleteGroup = hasPermission('group:delete');

  const planName = plans.find((plan) => plan.id === group?.planId)?.name ?? '—';

  async function loadCompanies(groupId: string) {
    try {
      setCompanies(await listCompanies(groupId));
    } catch {
      setError('Could not load companies.');
    }
  }

  // No GET /groups/:id endpoint exists — Group has no single-fetch route,
  // only the list one — so the target row is resolved out of listGroups(),
  // same "fetch everything, look up client-side" approach the platform-wide
  // Users directory already uses for Group/Company/Brand lookups.
  async function loadAll(groupId: string) {
    setIsLoading(true);
    setError(null);
    try {
      const [groupRows, planRows] = await Promise.all([listGroups(), listPlans()]);
      const found = groupRows.find((g) => g.id === groupId) ?? null;
      if (!found) {
        setError('Group not found.');
        return;
      }
      setGroup(found);
      setPlans(planRows);
      await loadCompanies(groupId);
    } catch {
      setError('Could not load this group.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleDeleteGroup() {
    if (!group) return;
    const confirmed = await confirm({
      title: 'Delete group',
      message: `Delete "${group.name}"? This cannot be undone — it only works if no companies still belong to it.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    setIsDeleting(true);
    try {
      await deleteGroup(group.id);
      navigate('/super-admin/companies');
    } catch {
      showToast('Could not delete this group — it may still have active companies under it.');
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-ink-muted">Loading group…</p>;
  }

  if (error || !group) {
    return <p className="text-sm text-danger">{error ?? 'Group not found.'}</p>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate('/super-admin/companies')}
        className="mb-4 flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Back to Companies
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="text-lg font-semibold text-ink">{group.name}</h2>
          <p className="text-sm text-ink-muted">Plan: {planName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={group.status === 'active' ? 'success' : 'danger'}>{group.status}</Badge>
          {canEditGroup && (
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              aria-label={`Edit ${group.name}`}
              title="Edit Group"
              className="rounded-md p-1.5 text-ink-muted hover:bg-primary/10 hover:text-primary"
            >
              <Pencil className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
          {canDeleteGroup && (
            <button
              type="button"
              onClick={handleDeleteGroup}
              disabled={isDeleting}
              aria-label={`Delete ${group.name}`}
              title="Delete Group"
              className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">Companies</h3>
        {canCreateCompany && (
          <Button variant="secondary" onClick={() => setIsCompanyModalOpen(true)}>
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add Company
          </Button>
        )}
      </div>

      {companies.length === 0 && (
        <EmptyStateCard
          icon={Building2}
          title="No companies yet"
          description="Add the first Company under this Group."
        />
      )}

      {companies.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {companies.map((company) => (
            <CompanyCard
              key={company.id}
              company={company}
              plans={plans}
              canDeleteCompany={canDeleteCompany}
              canEdit={canEditCompany}
              onDeleted={() => loadCompanies(group.id)}
              onSaved={() => loadCompanies(group.id)}
            />
          ))}
        </div>
      )}

      {isCompanyModalOpen && (
        <CreateCompanyModal
          groupId={group.id}
          plans={plans}
          onClose={() => setIsCompanyModalOpen(false)}
          onCreated={() => loadCompanies(group.id)}
        />
      )}

      {isEditModalOpen && (
        <EditGroupModal
          group={group}
          plans={plans}
          onClose={() => setIsEditModalOpen(false)}
          onSaved={() => loadAll(group.id)}
        />
      )}
    </div>
  );
}
