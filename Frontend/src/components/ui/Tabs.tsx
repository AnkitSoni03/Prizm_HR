interface TabItem {
  key: string;
  label: string;
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
              '-mb-px shrink-0 whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-all duration-150',
              active === item.key
                ? 'border-primary text-primary'
                : 'border-transparent text-ink-muted hover:border-border hover:bg-page/60 hover:text-ink',
            ].join(' ')}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
