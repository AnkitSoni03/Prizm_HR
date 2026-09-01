import { ChevronDown, Filter } from 'lucide-react';

interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  ariaLabel: string;
}

// A native <select> dressed up as a "Filter ▾" pill button — real, accessible
// dropdown behavior for free, styled to match the search box next to it.
export function FilterSelect({ value, onChange, options, placeholder, ariaLabel }: FilterSelectProps) {
  return (
    <div className="relative w-full shrink-0 sm:w-auto">
      <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" strokeWidth={1.75} />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
        className="w-full appearance-none rounded-xl border border-border bg-card py-2 pl-8 pr-8 text-sm font-medium text-ink transition-all duration-150 hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:w-auto"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" strokeWidth={1.75} />
    </div>
  );
}
