import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Tabs } from '../../components/ui/Tabs';
import { Table } from '../../components/ui/Table';
import { useAuth } from '../../context/auth-context';
import { listEmployees } from '../../api/companyAdmin/employees';
import { ApprovalsPage } from '../company-admin/ApprovalsPage';
import { CompanyPoliciesPage } from '../company-admin/CompanyPoliciesPage';
import { EditCompanyModal } from '../super-admin/components/EditCompanyModal';
import { getCompany, listPlans, type Company, type Employee, type Plan } from '../../api/tenancy';

type Tab = 'employees' | 'approvals' | 'policies';

function companyStatusTone(status: Company['status']) {
  if (status === 'active') return 'success';
  if (status === 'trial' || status === 'grace') return 'warning';
  return 'danger';
}

// Full-page replacement for the old CompanyDetailModal popup — mirrors
// super-admin/CompanyDetailPage.tsx's shell (back-link, header card, Tabs)
// but scoped to Group Admin's two tabs. Read-only by construction, same as
// the modal it replaces: Group Admin's seeded RBAC has no employee:create/
// update or any *:approve/*:reject code, so ApprovalsPage's action buttons
// and an "Add Employee" button both stay hidden purely via hasPermission().
export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('company:update');

  const [activeTab, setActiveTab] = useState<Tab>('employees');
  const [company, setCompany] = useState<Company | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  async function loadCompany(companyId: string) {
    setIsLoading(true);
    setError(null);
    try {
      const [companyRow, planRows] = await Promise.all([getCompany(companyId), listPlans()]);
      setCompany(companyRow);
      setPlans(planRows);
    } catch {
      setError('Could not load this company.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCompany(id);
  }, [id]);

  useEffect(() => {
    if (!id || activeTab !== 'employees') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoadingEmployees(true);
    setError(null);
    listEmployees({ companyId: id, limit: 100 })
      .then((result) => setEmployees(result.data))
      .catch(() => setError('Could not load employees for this company.'))
      .finally(() => setIsLoadingEmployees(false));
  }, [id, activeTab]);

  if (isLoading) {
    return <p className="text-sm text-ink-muted">Loading company…</p>;
  }

  if (error || !company) {
    return <p className="text-sm text-danger">{error ?? 'Company not found.'}</p>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate('/group-admin/companies')}
        className="mb-4 flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Back to Companies
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="text-lg font-semibold text-ink">{company.name}</h2>
          <p className="text-sm text-ink-muted">
            {company.legalName ?? '—'}
            {company.gstNumber ? ` · GST ${company.gstNumber}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={companyStatusTone(company.status)}>{company.status}</Badge>
          {canEdit && (
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              aria-label={`Edit ${company.name}`}
              title="Edit Company"
              className="rounded-md p-1.5 text-ink-muted hover:bg-primary/10 hover:text-primary"
            >
              <Pencil className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      <Tabs
        items={[
          { key: 'employees', label: 'Employees' },
          { key: 'approvals', label: 'Approvals' },
          { key: 'policies', label: 'Company Policies' },
        ]}
        active={activeTab}
        onChange={(key) => setActiveTab(key as Tab)}
      />

      {activeTab === 'employees' && (
        <Table
          isLoading={isLoadingEmployees}
          rows={employees}
          rowKey={(employee) => employee.id}
          emptyMessage="No employees found for this company."
          columns={[
            { key: 'name', header: 'Name', render: (e) => e.name ?? '—' },
            { key: 'code', header: 'Code', render: (e) => e.employeeCode },
            { key: 'employmentType', header: 'Type', render: (e) => e.employmentType },
            {
              key: 'status',
              header: 'Status',
              render: (e) => <Badge tone={e.status === 'active' ? 'success' : 'neutral'}>{e.status}</Badge>,
            },
          ]}
        />
      )}

      {activeTab === 'approvals' && <ApprovalsPage extraParams={{ companyId: company.id }} />}

      {activeTab === 'policies' && <CompanyPoliciesPage extraParams={{ companyId: company.id }} />}

      {isEditModalOpen && (
        <EditCompanyModal
          company={company}
          plans={plans}
          onClose={() => setIsEditModalOpen(false)}
          onSaved={() => loadCompany(company.id)}
        />
      )}
    </div>
  );
}
