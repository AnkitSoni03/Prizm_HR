import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import {
  listPowers,
  POWER_LEVEL_HINTS,
  POWER_LEVEL_LABELS,
  type Power,
  type PowerBrand,
  type PowerCompanyMap,
  type PowerGroupCompany,
  type PowerLevel,
  type PowerLevelMap,
  type PowerLimitMap,
} from '../api/powers';

interface PowerAssignmentProps {
  value: PowerLevelMap;
  onChange: (next: PowerLevelMap) => void;
  // What the employee held when the editor opened — a power granted there
  // at a level the current admin can't grant (e.g. Company level set by a
  // Company Admin, viewed by a Brand Admin) is shown locked, since the
  // server would reject changing or removing it.
  initialValue?: PowerLevelMap;
  // Brand level needs the employee to actually belong to a Brand.
  employeeHasBrand: boolean;
  // Group Admin / Super Admin screen only: choose which companies of the
  // Group a Group-level power covers. Without these props no company choice
  // is shown and each power keeps its current companies.
  companies?: PowerCompanyMap;
  onCompaniesChange?: (next: PowerCompanyMap) => void;
  groupCompanies?: PowerGroupCompany[];
  // Same for which brands of the employee's company a Company-level power
  // covers (Group Admin / Super Admin / Company Admin screens).
  brands?: PowerLimitMap;
  onBrandsChange?: (next: PowerLimitMap) => void;
  companyBrands?: PowerBrand[];
}

const LEVEL_ORDER: PowerLevel[] = ['brand', 'company', 'group'];

interface LimitOption {
  id: string;
  name: string;
  note?: string;
  isDefault: boolean;
}

// "All <things>" vs "Selected <things>" + a checkbox per option. `selected`
// null = all (incl. ones added later); an array = only those.
function LimitPicker({
  label,
  noun,
  options,
  selected,
  disabled,
  onChange,
}: {
  label: string;
  noun: string;
  options: LimitOption[];
  selected: string[] | null;
  disabled: boolean;
  onChange: (next: string[] | null) => void;
}) {
  const choices = [
    { all: true, title: `All ${noun}`, hint: `Every ${noun.replace(/ies$/, 'y').replace(/s$/, '')}, incl. ones added later` },
    { all: false, title: `Selected ${noun}`, hint: 'Only the ones ticked below' },
  ];

  function toggle(id: string) {
    const current = selected ?? [];
    onChange(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  }

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-medium text-ink-muted">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {choices.map((choice) => {
          const active = choice.all ? selected === null : selected !== null;
          return (
            <button
              key={choice.title}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() =>
                onChange(choice.all ? null : (selected ?? options.filter((o) => o.isDefault).map((o) => o.id)))
              }
              className={`rounded-lg border px-3 py-1.5 text-left text-xs transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                active ? 'border-primary bg-primary text-white' : 'border-border bg-card text-ink hover:border-primary/40'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <span className="block font-semibold">{choice.title}</span>
              <span className={`block ${active ? 'text-white/80' : 'text-ink-muted'}`}>{choice.hint}</span>
            </button>
          );
        })}
      </div>

      {selected !== null && (
        <div className="mt-2 space-y-1">
          {options.map((option) => (
            <label key={option.id} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={selected.includes(option.id)}
                disabled={disabled}
                onChange={() => toggle(option.id)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
              />
              <span>
                {option.name}
                {option.note && <span className="text-ink-muted"> {option.note}</span>}
              </span>
            </label>
          ))}
          {selected.length === 0 && <p className="text-xs text-danger">Tick at least one.</p>}
        </div>
      )}
    </div>
  );
}

// Checkbox + scope picker per power from the curated catalog (see
// Backend/src/config/powerCatalog.js) — reused as-is by EmployeeFormModal.tsx
// (create) and EmployeeDetailModal.tsx (edit). Fully optional: nothing
// checked is a valid, default state.
export function PowerAssignment({
  value,
  onChange,
  initialValue = {},
  employeeHasBrand,
  companies,
  onCompaniesChange,
  groupCompanies = [],
  brands,
  onBrandsChange,
  companyBrands = [],
}: PowerAssignmentProps) {
  const [powers, setPowers] = useState<Power[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPowers()
      .then(setPowers)
      .catch(() => setError('Could not load the list of assignable powers.'))
      .finally(() => setIsLoading(false));
  }, []);

  function usableLevels(power: Power): PowerLevel[] {
    return LEVEL_ORDER.filter(
      (level) =>
        power.levels.includes(level) &&
        power.allowedLevels.includes(level) &&
        (level !== 'brand' || employeeHasBrand)
    );
  }

  function isLocked(power: Power): boolean {
    const initialLevel = initialValue[power.key];
    return !!initialLevel && !power.allowedLevels.includes(initialLevel);
  }

  function toggle(power: Power) {
    const next = { ...value };
    if (next[power.key]) {
      delete next[power.key];
    } else {
      const usable = usableLevels(power);
      // Company is the common case; fall back to whatever this admin can give.
      next[power.key] = usable.includes('company') ? 'company' : usable[0];
    }
    onChange(next);
  }

  function setLevel(power: Power, level: PowerLevel) {
    onChange({ ...value, [power.key]: level });
  }

  // null = every company / brand (incl. ones added later).
  function setLimit(map: PowerLimitMap, emit: (next: PowerLimitMap) => void, key: string, ids: string[] | null) {
    const next = { ...map };
    if (ids === null) delete next[key];
    else next[key] = ids;
    emit(next);
  }

  const companyOptions: LimitOption[] = groupCompanies.map((c) => ({
    id: c.id,
    name: c.name,
    note: [c.isEmployeeCompany ? '(their own company)' : '', c.status !== 'active' ? `· ${c.status}` : '']
      .filter(Boolean)
      .join(' '),
    isDefault: c.isEmployeeCompany,
  }));
  const brandOptions: LimitOption[] = companyBrands.map((b) => ({
    id: b.id,
    name: b.name,
    note: [b.isEmployeeBrand ? '(their own brand)' : '', b.isActive ? '' : '· inactive'].filter(Boolean).join(' '),
    isDefault: b.isEmployeeBrand,
  }));

  if (isLoading) return <p className="text-sm text-ink-muted">Loading powers…</p>;
  if (error) return <p className="text-sm text-danger">{error}</p>;

  return (
    <div className="space-y-2">
      {powers.map((power) => {
        const locked = isLocked(power);
        const usable = usableLevels(power);
        const selectedLevel = value[power.key];
        const checked = !!selectedLevel;
        const unavailable = !locked && usable.length === 0;
        const disabled = locked || unavailable;

        return (
          <div
            key={power.key}
            className={`rounded-xl border px-3 py-2.5 transition ${
              checked ? 'border-primary/40 bg-primary-light/40' : 'border-border'
            } ${disabled ? 'opacity-70' : ''}`}
          >
            <label className={`flex items-start gap-3 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(power)}
                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{power.label}</span>
                <span className="block text-xs text-ink-muted">{power.description}</span>
                {locked && (
                  <span className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
                    <Lock className="h-3 w-3" strokeWidth={2} />
                    Granted at {POWER_LEVEL_LABELS[initialValue[power.key]]} level by a higher admin — you can&apos;t
                    change it.
                  </span>
                )}
                {unavailable && (
                  <span className="mt-1 block text-xs text-ink-muted">
                    {power.allowedLevels.length === 0
                      ? "You don't hold this power yourself, so you can't grant it."
                      : 'Needs Brand level, but this employee has no Brand.'}
                  </span>
                )}
              </span>
            </label>

            {checked && (
              <div className="mt-2.5 pl-7">
                <p className="mb-1.5 text-xs font-medium text-ink-muted">Power level</p>
                <div role="radiogroup" aria-label={`${power.label} level`} className="flex flex-wrap gap-1.5">
                  {power.levels.map((level) => {
                    const canPick = !locked && usable.includes(level);
                    const active = selectedLevel === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={!canPick}
                        onClick={() => setLevel(power, level)}
                        title={POWER_LEVEL_HINTS[level]}
                        className={`rounded-lg border px-3 py-1.5 text-left text-xs transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                          active
                            ? 'border-primary bg-primary text-white'
                            : 'border-border bg-card text-ink hover:border-primary/40'
                        } disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border`}
                      >
                        <span className="block font-semibold">{POWER_LEVEL_LABELS[level]}</span>
                        <span className={`block ${active ? 'text-white/80' : 'text-ink-muted'}`}>
                          {POWER_LEVEL_HINTS[level]}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {selectedLevel === 'group' &&
                  power.companyLimitable &&
                  companies &&
                  onCompaniesChange &&
                  companyOptions.length > 1 && (
                    <LimitPicker
                      label="Companies"
                      noun="companies"
                      options={companyOptions}
                      selected={companies[power.key] ?? null}
                      disabled={locked}
                      onChange={(ids) => setLimit(companies, onCompaniesChange, power.key, ids)}
                    />
                  )}

                {selectedLevel === 'company' && brands && onBrandsChange && brandOptions.length > 1 && (
                  <LimitPicker
                    label="Brands"
                    noun="brands"
                    options={brandOptions}
                    selected={brands[power.key] ?? null}
                    disabled={locked}
                    onChange={(ids) => setLimit(brands, onBrandsChange, power.key, ids)}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
