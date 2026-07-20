import { useState, type ChangeEvent } from 'react';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react';

interface PasswordInputProps {
  id: string;
  icon: LucideIcon;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
  required?: boolean;
  placeholder?: string;
}

// Shared by every password field across auth (Login, Activate, Reset) and
// the Settings "Change Password" card — same icon-left-input layout each of
// those already used, plus a show/hide toggle on the right.
export function PasswordInput({
  id,
  icon: Icon,
  value,
  onChange,
  autoComplete,
  required,
  placeholder = '••••••••',
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Icon
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
        strokeWidth={1.75}
      />
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        required={required}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border py-2 pl-10 pr-10 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
      >
        {visible ? <EyeOff className="h-4 w-4" strokeWidth={1.75} /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
      </button>
    </div>
  );
}
