import { useEffect, useState } from 'react';
import { Select } from '../../../components/ui/Select';
import { Input } from '../../../components/ui/Input';
import { listScopeCompanies, type ScopeCompany } from '../../../api/payroll';

export interface PayrollFilterValue {
  companyId: string;
  brandId: string;
  search: string;
}

// Company › Brand › search filters shared by the payroll tabs. A manager
// sees every company of the Group; a Company/Brand Admin only their own.
export function PayrollFilters({ value, onChange }: { value: PayrollFilterValue; onChange: (v: PayrollFilterValue) => void }) {
  const [companies, setCompanies] = useState<ScopeCompany[]>([]);

  useEffect(() => {
    listScopeCompanies().then(setCompanies).catch(() => setCompanies([]));
  }, []);

  const company = companies.length === 1 ? companies[0] : companies.find((c) => String(c.id) === value.companyId);
  const brands = company?.brands ?? [];

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {companies.length > 1 && (
        <Select
          label="Company"
          value={value.companyId}
          onChange={(e) => onChange({ ...value, companyId: e.target.value, brandId: '' })}
          placeholder="All companies"
          options={companies.map((c) => ({ value: String(c.id), label: c.name }))}
        />
      )}
      {brands.length > 0 && (
        <Select
          label="Brand"
          value={value.brandId}
          onChange={(e) => onChange({ ...value, brandId: e.target.value })}
          placeholder="All brands"
          options={brands.map((b) => ({ value: String(b.id), label: b.name }))}
        />
      )}
      <Input label="Search" value={value.search} onChange={(e) => onChange({ ...value, search: e.target.value })} placeholder="Name or code" />
    </div>
  );
}
