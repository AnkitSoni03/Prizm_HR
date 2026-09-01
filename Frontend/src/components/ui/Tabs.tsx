import type { ComponentType } from 'react';

interface TabItem {
  key: string;
  label: string;
  // Optional per-tab icon — purely visual, every existing caller that omits
  // it renders exactly as before.
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
}

interface TabsProps {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
}

export function Tabs({ items, active, onChange }: TabsProps) {
  return (
    <div className="no-scrollbar mb-4 overflow-x-auto border-b border-border">
      <div className="flex w-max min-w-full gap-1">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={[
              '-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-all duration-150',
              active === item.key
                ? 'border-primary text-primary'
                : 'border-transparent text-ink-muted hover:border-border hover:bg-page/60 hover:text-ink',
            ].join(' ')}
          >
            {item.icon && <item.icon className="h-4 w-4" strokeWidth={1.75} />}
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
