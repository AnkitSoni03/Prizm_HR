import { useEffect, useMemo, useState } from 'react';
import { Select } from '../../../components/ui/Select';
import { listScopeCompanies, type PayrollAccess, type ScopeCompany } from '../../../api/payroll';

export interface OwnerChoice {
  companyId: string | null;
  brandId: string | null;
}

// "Made for" picker for a NEW template / extra item: the caller's own level
// or any level below it (Group → Company → Brand). The list of companies /
// brands is already bounded by the server (/payroll/companies). Hidden when
// there's only one possible choice (a Brand Admin of one brand).
export function OwnerLevelSelect({
  access,
  value,
  onChange,
  disabled,
}: {
  access: PayrollAccess;
  value: OwnerChoice;
  onChange: (v: OwnerChoice) => void;
  disabled?: boolean;
}) {
  const [companies, setCompanies] = useState<ScopeCompany[]>([]);

  useEffect(() => {
    listScopeCompanies().then(setCompanies).catch(() => setCompanies([]));
  }, []);

  const options = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    if (access.level === 'group') out.push({ value: '|', label: 'Whole Group (every company)' });
    for (const c of companies) {
      if (access.level !== 'brand') out.push({ value: `${c.id}|`, label: c.usesBrands ? `${c.name} (all brands)` : c.name });
      if (c.usesBrands) for (const b of c.brands) out.push({ value: `${c.id}|${b.id}`, label: `${c.name} › ${b.name}` });
    }
    return out;
  }, [access.level, companies]);

  const current = `${value.companyId ?? ''}|${value.brandId ?? ''}`;

  // Default to the first option (the caller's own level) once loaded.
  useEffect(() => {
    if (options.length > 0 && !options.some((o) => o.value === current)) {
      const [companyId, brandId] = options[0].value.split('|');
      onChange({ companyId: companyId || null, brandId: brandId || null });
    }
  }, [options, current, onChange]);

  if (options.length <= 1) return null;
  return (
    <Select
      label="Made for"
      value={current}
      disabled={disabled}
      onChange={(e) => {
        const [companyId, brandId] = e.target.value.split('|');
        onChange({ companyId: companyId || null, brandId: brandId || null });
      }}
      options={options}
    />
  );
}
