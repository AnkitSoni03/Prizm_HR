import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Input({ label, error, id, className = '', ...rest }: InputProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        className={[
          'w-full rounded-xl border border-border bg-card px-3 py-2 text-base text-ink placeholder:text-ink-muted transition-all duration-150 hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border sm:text-sm',
          className,
        ].join(' ')}
        {...rest}
      />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
