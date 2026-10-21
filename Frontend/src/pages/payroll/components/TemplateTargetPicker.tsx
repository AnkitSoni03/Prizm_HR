import { useEffect, useState } from 'react';
import { listScopeCompanies, type PayrollAccess, type ScopeCompany } from '../../../api/payroll';

export interface TargetChoice {
  companyId: string;
  brandId: string | null;
}

// "Made for" for a salary template: any mix of companies (= all their
// brands) and single brands, within the caller's own level. A Group-level
// caller can instead tick "Whole Group" (every company, now and later — the
// list below is then greyed out, not ticked). Nothing is ticked up front.
// The company / brand list is already bounded by the server (/payroll/companies).
export function TemplateTargetPicker({
  access,
  value,
  onChange,
  wholeGroup,
  onWholeGroupChange,
  disabled,
}: {
  access: PayrollAccess;
  value: TargetChoice[];
  onChange: (v: TargetChoice[]) => void;
  wholeGroup: boolean;
  onWholeGroupChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  const [companies, setCompanies] = useState<ScopeCompany[]>([]);

  useEffect(() => {
    listScopeCompanies().then(setCompanies).catch(() => setCompanies([]));
  }, []);

  const isGroup = access.level === 'group';
  const canPickCompany = access.level !== 'brand';
  const has = (companyId: string, brandId: string | null) =>
    value.some((t) => String(t.companyId) === String(companyId) && String(t.brandId ?? '') === String(brandId ?? ''));

  function toggleCompany(c: ScopeCompany, on: boolean) {
    // Ticking a whole company replaces its single-brand picks.
    const rest = value.filter((t) => String(t.companyId) !== String(c.id));
    onChange(on ? [...rest, { companyId: String(c.id), brandId: null }] : rest);
  }

  function toggleBrand(c: ScopeCompany, brandId: string, on: boolean) {
    const rest = value.filter((t) => !(String(t.companyId) === String(c.id) && String(t.brandId) === String(brandId)));
    onChange(on ? [...rest, { companyId: String(c.id), brandId: String(brandId) }] : rest);
  }

  const box = 'h-4 w-4 rounded border-border text-primary focus:ring-primary/30';

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink">Made for</p>
      <p className="mb-2 text-xs text-ink-muted">
        Tick every company or brand that should be able to use this template. A ticked company covers all its brands.
      </p>
      <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-xl border border-border px-3">
        {isGroup && (
          <label className="flex items-center gap-2 py-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              className={box}
              checked={wholeGroup}
              disabled={disabled}
              onChange={(e) => onWholeGroupChange(e.target.checked)}
            />
            Whole Group (every company, including ones added later)
          </label>
        )}
        {companies.length === 0 && <p className="py-2 text-sm text-ink-muted">Loading…</p>}
        {companies.map((c) => {
          const companyOn = has(String(c.id), null);
          const brands = c.usesBrands ? c.brands : [];
          return (
            <div key={c.id} className={`py-2 ${wholeGroup ? 'opacity-50' : ''}`}>
              {canPickCompany ? (
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    className={box}
                    checked={!wholeGroup && companyOn}
                    disabled={disabled || wholeGroup}
                    onChange={(e) => toggleCompany(c, e.target.checked)}
                  />
                  <span className="font-medium">{c.name}</span>
                  {brands.length > 0 && <span className="text-xs text-ink-muted">(all brands)</span>}
                </label>
              ) : (
                <p className="text-sm font-medium text-ink">{c.name}</p>
              )}
              {brands.length > 0 && (
                // Tree: an elbow from the company's checkbox to each brand,
                // with the vertical line running on past every brand but the last.
                <ul className="ml-[7px] space-y-1 pt-1">
                  {brands.map((b, i) => (
                    <li key={b.id} className="relative pl-5">
                      <span aria-hidden className="absolute -top-1 left-0 h-[calc(50%+4px)] w-3.5 rounded-bl-md border-b border-l border-ink/40" />
                      {i < brands.length - 1 && <span aria-hidden className="absolute top-1/2 -bottom-1 left-0 border-l border-ink/40" />}
                      <label className="flex items-center gap-2 text-sm text-ink">
                        <input
                          type="checkbox"
                          className={box}
                          checked={!wholeGroup && (companyOn || has(String(c.id), String(b.id)))}
                          disabled={disabled || wholeGroup || companyOn}
                          onChange={(e) => toggleBrand(c, String(b.id), e.target.checked)}
                        />
                        {b.name}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
