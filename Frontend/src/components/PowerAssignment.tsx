import { useEffect, useState } from 'react';
import { listPowers, type Power } from '../api/powers';

interface PowerAssignmentProps {
  selectedKeys: string[];
  onChange: (keys: string[]) => void;
}

// Checkbox list of the curated "powers" catalog (see Backend/src/config/
// powerCatalog.js) — reused as-is by EmployeeFormModal.tsx (create) and
// EmployeeDetailModal.tsx (edit). Fully optional: zero checked is a valid,
// default state.
export function PowerAssignment({ selectedKeys, onChange }: PowerAssignmentProps) {
  const [powers, setPowers] = useState<Power[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPowers()
      .then(setPowers)
      .catch(() => setError('Could not load the list of assignable powers.'))
      .finally(() => setIsLoading(false));
  }, []);

  function toggle(key: string) {
    onChange(
      selectedKeys.includes(key) ? selectedKeys.filter((k) => k !== key) : [...selectedKeys, key]
    );
  }

  if (isLoading) return <p className="text-sm text-ink-muted">Loading powers…</p>;
  if (error) return <p className="text-sm text-danger">{error}</p>;

  return (
    <div className="space-y-2">
      {powers.map((power) => (
        <label
          key={power.key}
          className="flex cursor-pointer items-start gap-3 rounded-xl border border-border px-3 py-2.5 hover:bg-page"
        >
          <input
            type="checkbox"
            checked={selectedKeys.includes(power.key)}
            onChange={() => toggle(power.key)}
            className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
          />
          <span>
            <span className="block text-sm font-medium text-ink">{power.label}</span>
            <span className="block text-xs text-ink-muted">{power.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
