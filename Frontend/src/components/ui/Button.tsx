import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  isLoading?: boolean;
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover hover:shadow-md active:scale-[0.98]',
  secondary: 'border border-border bg-card text-ink shadow-xs hover:border-primary/30 hover:bg-page active:scale-[0.98]',
  danger: 'bg-danger text-white shadow-xs hover:bg-danger/90 hover:shadow-md active:scale-[0.98]',
};

export function Button({
  variant = 'primary',
  isLoading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || isLoading}
      className={[
        'flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100',
        VARIANT_CLASSES[variant],
        className,
      ].join(' ')}
      {...rest}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />}
      {children}
    </button>
  );
}
