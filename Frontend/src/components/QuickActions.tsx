import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';

export interface QuickAction {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
      <h3 className="mb-4 text-base font-semibold text-ink">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <Link
            key={action.label}
            to={action.to}
            className="group flex flex-col items-center gap-2 rounded-lg border border-border bg-page px-3 py-4 text-center transition-colors duration-200 hover:border-primary hover:bg-primary-light"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-card text-primary transition-transform duration-200 group-hover:scale-105">
              <action.icon className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <span className="text-xs font-medium text-ink">{action.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
