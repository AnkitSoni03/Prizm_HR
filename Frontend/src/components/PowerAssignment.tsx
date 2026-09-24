import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import {
  listPowers,
  POWER_LEVEL_HINTS,
  POWER_LEVEL_LABELS,
  type Power,
  type PowerLevel,
  type PowerLevelMap,
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
}

const LEVEL_ORDER: PowerLevel[] = ['brand', 'company', 'group'];

// Checkbox + scope picker per power from the curated catalog (see
// Backend/src/config/powerCatalog.js) — reused as-is by EmployeeFormModal.tsx
// (create) and EmployeeDetailModal.tsx (edit). Fully optional: nothing
// checked is a valid, default state.
export function PowerAssignment({ value, onChange, initialValue = {}, employeeHasBrand }: PowerAssignmentProps) {
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
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
