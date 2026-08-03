import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';

export interface QuickAction {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-xs sm:p-5">
      <h3 className="mb-3 text-sm font-semibold text-ink sm:mb-4 sm:text-base">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
        {actions.map((action) => (
          <Link
            key={action.label}
            to={action.to}
            className="group flex flex-col items-center gap-1.5 rounded-lg border border-border bg-page px-2.5 py-3 text-center transition-all duration-200 hover:border-primary hover:bg-primary-light active:scale-[0.97] sm:gap-2 sm:py-4"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-card text-primary transition-transform duration-200 group-hover:scale-105 sm:h-9 sm:w-9">
              <action.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
            </span>
            <span className="text-[11px] font-medium text-ink sm:text-xs">{action.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
