import type { SelectHTMLAttributes } from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  placeholder?: string;
}

export function Select({ label, options, placeholder, id, className = '', ...rest }: SelectProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <select
        id={id}
        className={[
          'w-full rounded-xl border border-border bg-card px-3 py-2 text-base text-ink transition-all duration-150 hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border sm:text-sm',
          className,
        ].join(' ')}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
