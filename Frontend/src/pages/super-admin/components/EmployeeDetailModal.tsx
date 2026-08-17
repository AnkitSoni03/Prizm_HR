import { Modal } from '../../../components/ui/Modal';
import { Badge } from '../../../components/ui/Badge';
import { Avatar } from '../../../components/ui/Avatar';
import type { Employee } from '../../../api/tenancy';
import { formatDisplayDate, formatDisplayDateTime } from '../../../utils/dateDisplay';

interface EmployeeDetailModalProps {
  employee: Employee;
  // Omitted by callers that are already scoped to one Group (e.g. Group
  // Admin's own Company Detail page) — showing "Group: X" is redundant when
  // there's only ever one possible value on that page. The platform-wide
  // Super Admin Users directory always passes it.
  groupName?: string;
  companyName: string;
  brandName: string | null;
  onClose: () => void;
}

function statusTone(status: Employee['status']) {
  if (status === 'active') return 'success';
  if (status === 'onboarding' || status === 'on_notice') return 'warning';
  return 'neutral';
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-0.5 text-sm text-ink">{value}</p>
    </div>
  );
}

// Read-only — Super Admin can view an employee's basic details from the
// Users directory, but not edit them. Department/designation/shift/roster
// assignment and any other management is Company Admin's job.
export function EmployeeDetailModal({ employee, groupName, companyName, brandName, onClose }: EmployeeDetailModalProps) {
  return (
    <Modal title={employee.name ?? employee.employeeCode} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Avatar src={employee.photoDownloadUrl} size="lg" />
          <div>
            <p className="text-base font-semibold text-ink">{employee.name ?? '—'}</p>
            <p className="text-sm text-ink-muted">{employee.employeeCode ?? 'No code yet'}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge tone={statusTone(employee.status)}>{employee.status}</Badge>
          <Badge tone={employee.isActive ? 'success' : 'danger'}>
            {employee.isActive ? 'Account Active' : 'Account Inactive'}
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-page p-4 sm:grid-cols-2">
          {groupName !== undefined && <Field label="Group" value={groupName} />}
          <Field label="Company" value={companyName} />
          <Field label="Brand" value={brandName ?? 'Non-Brand'} />
          <Field label="Employment Type" value={employee.employmentType.replace('_', ' ')} />
          <Field label="Date of Joining" value={employee.dateOfJoining ? formatDisplayDate(employee.dateOfJoining) : 'Not set'} />
          <Field label="Added On" value={formatDisplayDateTime(employee.createdAt)} />
        </div>

        <p className="text-xs text-ink-muted">
          This is a read-only view. Department, designation, shift, and roster assignment are
          managed by the company's own admin.
        </p>
      </div>
    </Modal>
  );
}
