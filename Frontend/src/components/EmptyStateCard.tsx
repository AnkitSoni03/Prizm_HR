import type { ComponentType } from 'react';
import { Sparkles } from 'lucide-react';

interface EmptyStateCardProps {
  title: string;
  description: string;
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
}

export function EmptyStateCard({ title, description, icon: Icon = Sparkles }: EmptyStateCardProps) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center shadow-xs">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-light text-primary">
        <div className="absolute inset-0 -z-10 rounded-2xl bg-primary/20 blur-xl" aria-hidden="true" />
        <Icon className="h-6 w-6" strokeWidth={1.75} />
      </div>
      <h2 className="mt-5 text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-ink-muted">{description}</p>
    </div>
  );
}
