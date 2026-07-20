import type { KeyboardEvent, MouseEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { EditCompanyModal } from './EditCompanyModal';
import { deleteCompany, type Company, type Plan } from '../../../api/tenancy';

interface CompanyCardProps {
  company: Company;
  plans: Plan[];
  canDeleteCompany: boolean;
  canEdit: boolean;
  onDeleted: () => void;
  onSaved: () => void;
}

function companyStatusTone(status: Company['status']) {
  if (status === 'active') return 'success';
  if (status === 'trial' || status === 'grace') return 'warning';
  return 'danger';
}

// A clickable summary card only — Departments/Designations/Brands/
// Shifts/Rosters/Employees all now live on the dedicated detail page at
// /super-admin/companies/:id (CompanyDetailPage) instead of expanding
// inline here.
export function CompanyCard({ company, plans, canDeleteCompany, canEdit, onDeleted, onSaved }: CompanyCardProps) {
  const navigate = useNavigate();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const planName = plans.find((plan) => plan.id === company.planId)?.name ?? '—';
  const detailPath = `/super-admin/companies/${company.id}`;

  function goToDetail() {
    navigate(detailPath);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      goToDetail();
    }
  }

  function handleOpenEdit(event: MouseEvent) {
    event.stopPropagation();
    setIsEditModalOpen(true);
  }

  async function handleDeleteCompany(event: MouseEvent) {
    event.stopPropagation();
    if (!window.confirm(`Delete company "${company.name}"? This cannot be undone.`)) return;
    try {
      await deleteCompany(company.id);
      onDeleted();
    } catch {
      window.alert('Could not delete this company — it may still have active brands, employees, or users.');
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={goToDetail}
      onKeyDown={handleKeyDown}
      className="flex cursor-pointer flex-col items-start gap-3 rounded-xl border border-border bg-card p-5 text-left shadow-sm transition-colors hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex w-full items-start justify-between gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={companyStatusTone(company.status)}>{company.status}</Badge>
          {canEdit && (
            <button
              type="button"
              onClick={handleOpenEdit}
              aria-label={`Edit ${company.name}`}
              title="Edit Company"
              className="rounded-md p-1.5 text-ink-muted hover:bg-primary/10 hover:text-primary"
            >
              <Pencil className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
          {canDeleteCompany && (
            <button
              type="button"
              onClick={handleDeleteCompany}
              aria-label={`Delete ${company.name}`}
              className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">{company.name}</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {company.legalName ?? '—'}
          {company.gstNumber ? ` · GST ${company.gstNumber}` : ''}
        </p>
        <p className="mt-1 text-xs text-ink-muted">Plan: {planName}</p>
      </div>

      {isEditModalOpen && (
        // Stops the edit modal's clicks (including its overlay, which
        // closes on click) from bubbling up to the card's own onClick,
        // which would otherwise navigate to the detail page mid-interaction.
        <div onClick={(event) => event.stopPropagation()}>
          <EditCompanyModal
            company={company}
            plans={plans}
            onClose={() => setIsEditModalOpen(false)}
            onSaved={onSaved}
          />
        </div>
      )}
    </div>
  );
}
