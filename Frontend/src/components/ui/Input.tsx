import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  // Smaller padding/label for tight spots (e.g. an inline upload row) —
  // every other caller omits this and keeps the normal size untouched.
  compact?: boolean;
}

export function Input({ label, error, id, className = '', compact = false, ...rest }: InputProps) {
  return (
    <div>
      <label htmlFor={id} className={`mb-1.5 block font-medium text-ink ${compact ? 'text-xs' : 'text-sm'}`}>
        {label}
      </label>
      <input
        id={id}
        className={[
          'w-full rounded-xl border border-border bg-card text-ink placeholder:text-ink-muted transition-all duration-150 hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border',
          compact ? 'px-2.5 py-1.5 text-sm' : 'px-3 py-2 text-base sm:text-sm',
          className,
        ].join(' ')}
        {...rest}
      />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
