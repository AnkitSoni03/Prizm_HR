import type { DepartmentHeadcount } from '../../api/companyAdmin/dashboard';

export function DepartmentHeadcountBars({ data }: { data: DepartmentHeadcount[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
      <h3 className="mb-1 text-base font-semibold text-ink">Department Wise Headcount</h3>
      <p className="mb-4 text-xs text-ink-muted">Active employees per department</p>

      {data.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-ink-muted">
          No employees yet
        </div>
      ) : (
        <ul className="space-y-3.5">
          {data.map((dept) => (
            <li key={dept.name} className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 truncate text-ink-muted" title={dept.name}>
                {dept.name}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.max(4, (dept.count / max) * 100)}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right font-medium text-ink">{dept.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
