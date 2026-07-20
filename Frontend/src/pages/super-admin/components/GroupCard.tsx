import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { CreateCompanyModal } from './CreateCompanyModal';
import { EditGroupModal } from './EditGroupModal';
import { CompanyCard } from './CompanyCard';
import { deleteGroup, listCompanies, type Company, type Group, type Plan } from '../../../api/tenancy';

interface GroupCardProps {
  group: Group;
  plans: Plan[];
  canCreateCompany: boolean;
  canDeleteGroup: boolean;
  canDeleteCompany: boolean;
  canEditGroup: boolean;
  canEditCompany: boolean;
  onDeleted: () => void;
  onSaved: () => void;
}

export function GroupCard({
  group,
  plans,
  canCreateCompany,
  canDeleteGroup,
  canDeleteCompany,
  canEditGroup,
  canEditCompany,
  onDeleted,
  onSaved,
}: GroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const planName = (planId: string | null) => plans.find((plan) => plan.id === planId)?.name ?? '—';

  async function loadCompanies() {
    setIsLoading(true);
    setError(null);
    try {
      setCompanies(await listCompanies(group.id));
    } catch {
      setError('Could not load companies.');
    } finally {
      setIsLoading(false);
    }
  }

  function toggleExpand() {
    const next = !isExpanded;
    setIsExpanded(next);
    if (next && companies === null) {
      loadCompanies();
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete group "${group.name}"? This cannot be undone.`)) return;
    try {
      await deleteGroup(group.id);
      onDeleted();
    } catch {
      window.alert('Could not delete this group — it may still have active companies under it.');
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex w-full items-center justify-between px-5 py-4">
        <button
          type="button"
          onClick={toggleExpand}
          className="flex flex-1 items-center gap-3 text-left"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
          )}
          <div>
            <p className="text-sm font-semibold text-ink">{group.name}</p>
            <p className="text-xs text-ink-muted">Plan: {planName(group.planId)}</p>
          </div>
        </button>
        <div className="flex items-center gap-3">
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
              onClick={handleDelete}
              aria-label={`Delete ${group.name}`}
              className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border px-5 py-4">
          {isLoading && <p className="text-sm text-ink-muted">Loading companies…</p>}
          {error && <p className="text-sm text-danger">{error}</p>}
          {!isLoading && !error && companies?.length === 0 && (
            <p className="text-sm text-ink-muted">No companies yet.</p>
          )}
          {!isLoading && companies && companies.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {companies.map((company) => (
                <CompanyCard
                  key={company.id}
                  company={company}
                  plans={plans}
                  canDeleteCompany={canDeleteCompany}
                  canEdit={canEditCompany}
                  onDeleted={loadCompanies}
                  onSaved={loadCompanies}
                />
              ))}
            </div>
          )}

          {canCreateCompany && (
            <Button variant="secondary" className="mt-4" onClick={() => setIsModalOpen(true)}>
              <Plus className="h-4 w-4" strokeWidth={1.75} />
              Add Company
            </Button>
          )}
        </div>
      )}

      {isModalOpen && (
        <CreateCompanyModal
          groupId={group.id}
          plans={plans}
          onClose={() => setIsModalOpen(false)}
          onCreated={loadCompanies}
        />
      )}

      {isEditModalOpen && (
        <EditGroupModal
          group={group}
          plans={plans}
          onClose={() => setIsEditModalOpen(false)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
