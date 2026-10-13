import { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { monthKeyLabel } from '../../../api/payroll';

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Props {
  label: string;
  // 'YYYY-MM' keys, e.g. ['2026-10', '2026-12'].
  value: string[];
  onChange: (next: string[]) => void;
  hint?: string;
}

// Pick any set of months, across years: a year stepper over a 12-month grid,
// with the chosen months listed underneath.
export function MonthMultiPicker({ label, value, onChange, hint }: Props) {
  const now = new Date();
  const [year, setYear] = useState(() => (value[0] ? Number(value[0].slice(0, 4)) : now.getFullYear()));
  const selected = new Set(value);

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange([...next].sort());
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">{label}</p>
        <span className="text-xs text-ink-muted">{value.length} selected</span>
      </div>
      <div className="rounded-xl border border-border p-2">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" aria-label="Previous year" onClick={() => setYear(year - 1)} className="rounded-lg p-1 text-ink-muted hover:bg-page hover:text-ink">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-ink">{year}</span>
          <button type="button" aria-label="Next year" onClick={() => setYear(year + 1)} className="rounded-lg p-1 text-ink-muted hover:bg-page hover:text-ink">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
          {SHORT.map((name, i) => {
            const key = `${year}-${String(i + 1).padStart(2, '0')}`;
            const on = selected.has(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(key)}
                className={`rounded-lg border px-2 py-1.5 text-sm ${
                  on ? 'border-primary bg-primary text-white' : 'border-border text-ink hover:border-primary hover:text-primary'
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((key) => (
            <span key={key} className="inline-flex items-center gap-1 rounded-full bg-primary-light px-2 py-0.5 text-xs text-primary">
              {monthKeyLabel(key)}
              <button type="button" aria-label={`Remove ${monthKeyLabel(key)}`} onClick={() => toggle(key)} className="hover:text-danger">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
