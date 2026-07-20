import type { ReactNode } from 'react';

type Tone = 'success' | 'warning' | 'danger' | 'neutral';

interface BadgeProps {
  tone: Tone;
  children: ReactNode;
  title?: string;
}

const TONE_CLASSES: Record<Tone, string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  neutral: 'bg-muted text-ink-muted',
};

export function Badge({ tone, children, title }: BadgeProps) {
  return (
    <span
      title={title}
      className={[
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize',
        TONE_CLASSES[tone],
      ].join(' ')}
    >
      {children}
    </span>
  );
}
