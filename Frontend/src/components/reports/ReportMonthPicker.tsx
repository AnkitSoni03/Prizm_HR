import { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

// Month picker for the Monthly Report: tick any months (not necessarily
// consecutive, may span years), up to MAX_REPORT_MONTHS. Values are 'YYYY-MM'.

export const MAX_REPORT_MONTHS = 12;
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const key = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;
const labelOf = (value: string) => {
  const [y, m] = value.split('-').map(Number);
  return `${SHORT[m - 1]} ${y}`;
};

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

export function ReportMonthPicker({ value, onChange }: Props) {
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  const [year, setYear] = useState(thisYear);
  const selected = new Set(value);
  const sorted = [...value].sort();

  const isFuture = (month: number) => year > thisYear || (year === thisYear && month > thisMonth);

  function toggle(month: number) {
    const k = key(year, month);
    if (selected.has(k)) onChange(value.filter((v) => v !== k));
    else if (value.length < MAX_REPORT_MONTHS) onChange([...value, k]);
  }

  // Every month of the shown year that has started (replaces the selection,
  // since a full year is already the 12-month maximum).
  function wholeYear() {
    const months = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !isFuture(m));
    onChange(months.map((m) => key(year, m)));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous year"
            className="rounded-lg p-1.5 text-ink-muted hover:bg-page"
            onClick={() => setYear((y) => y - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="w-14 text-center text-sm font-semibold text-ink">{year}</span>
          <button
            type="button"
            aria-label="Next year"
            className="rounded-lg p-1.5 text-ink-muted hover:bg-page disabled:opacity-40"
            onClick={() => setYear((y) => y + 1)}
            disabled={year >= thisYear}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-3 text-xs">
          <button type="button" className="text-primary hover:underline" onClick={wholeYear}>
            Whole {year}
          </button>
          {value.length > 0 && (
            <button type="button" className="text-primary hover:underline" onClick={() => onChange([])}>
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {SHORT.map((label, i) => {
          const month = i + 1;
          const on = selected.has(key(year, month));
          const future = isFuture(month);
          const full = !on && value.length >= MAX_REPORT_MONTHS;
          return (
            <button
              key={label}
              type="button"
              disabled={future || full}
              onClick={() => toggle(month)}
              aria-pressed={on}
              className={[
                'rounded-xl border px-2 py-2 text-sm font-medium transition-colors',
                on ? 'border-primary bg-primary text-white' : 'border-border bg-card text-ink hover:border-primary/50',
                future || full ? 'cursor-not-allowed opacity-40 hover:border-border' : '',
              ].join(' ')}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div>
        <p className="mb-1.5 text-xs text-ink-muted">
          {value.length === 0
            ? 'Pick one or more months.'
            : `${value.length} month${value.length === 1 ? '' : 's'} selected${value.length >= MAX_REPORT_MONTHS ? ` (max ${MAX_REPORT_MONTHS})` : ''}`}
        </p>
        {value.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {sorted.map((v) => (
              <span key={v} className="inline-flex items-center gap-1 rounded-full bg-primary-light px-2 py-0.5 text-xs text-primary">
                {labelOf(v)}
                <button type="button" aria-label={`Remove ${labelOf(v)}`} onClick={() => onChange(value.filter((x) => x !== v))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
