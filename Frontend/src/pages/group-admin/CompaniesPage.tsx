import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { listCompanies, type Company } from '../../api/tenancy';

function companyStatusTone(status: Company['status']) {
  if (status === 'active') return 'success';
  if (status === 'trial' || status === 'grace') return 'warning';
  return 'danger';
}

// Read-only: Group Admin has company:read but not company:create (only
// Super Admin creates Companies — CLAUDE.md's tenancy hierarchy rule).
// listCompanies() with no groupId argument is scoped to the caller's own
// Group server-side (company.service.js::listCompanies), so there's no risk
// of this ever listing another Group's Companies.
export function CompaniesPage() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCompanies()
      .then(setCompanies)
      .catch(() => setError('Could not load companies.'))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && !error && companies.length === 0 && (
        <EmptyStateCard
          icon={Building2}
          title="No companies yet"
          description="Your Group has no Companies yet — only a Super Admin can add one."
        />
      )}

      {(isLoading || companies.length > 0) && (
        <Table
          isLoading={isLoading}
          rows={companies}
          rowKey={(company) => company.id}
          columns={[
            {
              key: 'name',
              header: 'Name',
              render: (company) => (
                <button
                  type="button"
                  onClick={() => navigate(`/group-admin/companies/${company.id}`)}
                  className="font-medium text-ink hover:text-primary hover:underline"
                >
                  {company.name}
                </button>
              ),
            },
            { key: 'legalName', header: 'Legal Name', render: (company) => company.legalName ?? '—' },
            {
              key: 'status',
              header: 'Status',
              render: (company) => <Badge tone={companyStatusTone(company.status)}>{company.status}</Badge>,
            },
            {
              key: 'usesBrands',
              header: 'Mode',
              render: (company) => (company.usesBrands ? 'Brands' : 'Direct'),
            },
          ]}
        />
      )}
    </div>
  );
}
