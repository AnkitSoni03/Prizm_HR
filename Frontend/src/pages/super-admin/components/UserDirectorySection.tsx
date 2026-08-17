import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Pagination } from '../../../components/ui/Pagination';
import { Avatar } from '../../../components/ui/Avatar';
import type { Employee } from '../../../api/tenancy';
import { EmployeeDetailModal } from './EmployeeDetailModal';

export interface DirectorySection {
  key: string;
  groupName: string;
  companyName: string;
  // null means the company operates directly (companies.uses_brands =
  // false) — rendered as "Non-Brand" rather than a brand name.
  brandName: string | null;
  employees: Employee[];
}

const PREVIEW_COUNT = 5;
const PAGE_SIZE = 20;

function statusTone(status: Employee['status']) {
  if (status === 'active') return 'success';
  if (status === 'onboarding' || status === 'on_notice') return 'warning';
  return 'neutral';
}

// The full employee list for every section is already in memory (fetched
// once by UsersPage), so "See more" and the 20-per-page expanded view are
// both plain array slices here — no extra network round trips needed.
export function UserDirectorySection({ section }: { section: DirectorySection }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const visible = isExpanded
    ? section.employees.slice(offset, offset + PAGE_SIZE)
    : section.employees.slice(0, PREVIEW_COUNT);

  function handleExpand() {
    setIsExpanded(true);
    setOffset(0);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="font-semibold text-ink">{section.groupName}</span>
          <ChevronRight className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.75} />
          <span className="font-medium text-ink">{section.companyName}</span>
          <ChevronRight className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.75} />
          <span className="text-ink-muted">{section.brandName ?? 'Non-Brand'}</span>
        </div>
        <Badge tone="neutral">
          {section.employees.length} employee{section.employees.length === 1 ? '' : 's'}
        </Badge>
      </div>

      <div className="space-y-2">
        {visible.map((employee) => (
          <button
            key={employee.id}
            type="button"
            onClick={() => setSelectedEmployee(employee)}
            className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-page px-4 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary-light/40"
          >
            <div className="flex items-center gap-2.5">
              <Avatar src={employee.photoDownloadUrl} size="sm" />
              <div>
                <p className="text-sm font-medium text-ink">{employee.name ?? '—'}</p>
                <p className="text-xs text-ink-muted">
                  {employee.employeeCode ?? 'No code yet'} · {employee.employmentType.replace('_', ' ')}
                </p>
              </div>
            </div>
            <Badge tone={statusTone(employee.status)}>{employee.status}</Badge>
          </button>
        ))}
      </div>

      {!isExpanded && section.employees.length > PREVIEW_COUNT && (
        <Button variant="secondary" className="mt-3" onClick={handleExpand}>
          See more ({section.employees.length - PREVIEW_COUNT} more)
        </Button>
      )}

      {isExpanded && (
        <Pagination total={section.employees.length} limit={PAGE_SIZE} offset={offset} onOffsetChange={setOffset} />
      )}

      {selectedEmployee && (
        <EmployeeDetailModal
          employee={selectedEmployee}
          groupName={section.groupName}
          companyName={section.companyName}
          brandName={section.brandName}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  );
}
