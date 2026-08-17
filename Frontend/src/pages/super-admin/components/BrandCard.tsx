import { useState, type MouseEvent } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Avatar } from '../../../components/ui/Avatar';
import { EmployeeFormModal } from './EmployeeFormModal';
import { EditBrandModal } from './EditBrandModal';
import { useConfirm } from '../../../context/confirm-context';
import { useToast } from '../../../context/toast-context';
import { deleteBrand, deleteEmployee, listEmployees, type Brand, type Employee } from '../../../api/tenancy';

interface BrandCardProps {
  // null represents the company-level employee panel for a company that
  // operates directly (companies.uses_brands = false).
  brand: Brand | null;
  companyId: string;
  canCreateEmployee: boolean;
  canDeleteEmployee: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onBrandSaved: () => void;
  onBrandDeleted: () => void;
}

function employeeStatusTone(status: Employee['status']) {
  if (status === 'active') return 'success';
  if (status === 'onboarding' || status === 'on_notice') return 'warning';
  return 'neutral';
}

// Super Admin's scope here is deliberately minimal: create the Brand/Company
// and its employees by name only. Department, Designation, Shifts, and
// Roster are Company Admin's job, done later from the Company Admin portal —
// this card no longer manages any of them.
export function BrandCard({
  brand,
  companyId,
  canCreateEmployee,
  canDeleteEmployee,
  canEdit,
  canDelete,
  onBrandSaved,
  onBrandDeleted,
}: BrandCardProps) {
  const confirm = useConfirm();
  const showToast = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeletingBrand, setIsDeletingBrand] = useState(false);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<string | null>(null);
  const brandId = brand?.id;

  async function loadEmployees() {
    try {
      setEmployees(await listEmployees({ companyId, brandId }));
    } catch {
      setEmployees([]);
    }
  }

  function toggleExpand() {
    const next = !isExpanded;
    setIsExpanded(next);
    if (next && employees === null) loadEmployees();
  }

  async function handleDeleteBrand(event: MouseEvent) {
    event.stopPropagation();
    if (!brand) return;
    const confirmed = await confirm({
      title: 'Delete brand',
      message: `Delete brand "${brand.name}"? This cannot be undone — it only works if no employees are still assigned to it.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    setIsDeletingBrand(true);
    try {
      await deleteBrand(brand.id);
      onBrandDeleted();
    } catch {
      showToast('Could not delete this brand — it may still have employees assigned.');
      setIsDeletingBrand(false);
    }
  }

  async function handleDeleteEmployee(employee: Employee) {
    const confirmed = await confirm({
      title: 'Delete employee',
      message: `Permanently delete "${employee.name ?? employee.employeeCode}"? This cannot be undone — their entire record is removed, not just deactivated.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    setDeletingEmployeeId(employee.id);
    try {
      await deleteEmployee(employee.id);
      await loadEmployees();
    } catch {
      showToast('Could not delete this employee. Please try again.');
    } finally {
      setDeletingEmployeeId(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex w-full items-center justify-between px-4 py-2.5">
        <button
          type="button"
          onClick={toggleExpand}
          className="flex flex-1 items-center gap-3 text-left"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
          )}
          <div>
            <p className="text-sm font-medium text-ink">{brand ? brand.name : 'Company level'}</p>
            <p className="text-xs text-ink-muted">
              {brand
                ? `${brand.code ? `Code: ${brand.code}` : '—'}${
                    brand.city || brand.state
                      ? ` · ${[brand.city, brand.state].filter(Boolean).join(', ')}`
                      : ''
                  }`
                : 'Employees for this company directly'}
            </p>
          </div>
        </button>
        <div className="flex items-center gap-2">
          {brand && (
            <Badge tone={brand.isActive ? 'success' : 'neutral'}>
              {brand.isActive ? 'active' : 'inactive'}
            </Badge>
          )}
          {brand && canEdit && (
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              aria-label={`Edit ${brand.name}`}
              title="Edit Brand"
              className="rounded-md p-1.5 text-ink-muted hover:bg-primary/10 hover:text-primary"
            >
              <Pencil className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
          {brand && canDelete && (
            <button
              type="button"
              onClick={handleDeleteBrand}
              disabled={isDeletingBrand}
              aria-label={`Delete ${brand.name}`}
              title="Delete Brand"
              className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border bg-page px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Employees</p>
            {canCreateEmployee && (
              <Button variant="secondary" onClick={() => setIsEmployeeModalOpen(true)}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                Add Employee
              </Button>
            )}
          </div>
          {employees?.length === 0 && <p className="text-sm text-ink-muted">No employees yet.</p>}
          {employees && employees.length > 0 && (
            <div className="space-y-2">
              {employees.map((employee) => (
                <div
                  key={employee.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar src={employee.photoDownloadUrl} size="sm" />
                    <div>
                      <p className="text-sm font-medium text-ink">{employee.name}</p>
                      <p className="text-xs text-ink-muted">{employee.employeeCode ?? 'No code yet'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={employeeStatusTone(employee.status)}>{employee.status}</Badge>
                    {canDeleteEmployee && (
                      <button
                        type="button"
                        onClick={() => handleDeleteEmployee(employee)}
                        disabled={deletingEmployeeId === employee.id}
                        aria-label={`Delete ${employee.name ?? employee.employeeCode}`}
                        title="Delete Employee"
                        className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isEmployeeModalOpen && (
        <EmployeeFormModal
          companyId={companyId}
          brandId={brandId}
          onClose={() => setIsEmployeeModalOpen(false)}
          onCreated={loadEmployees}
        />
      )}

      {isEditModalOpen && brand && (
        <EditBrandModal
          brand={brand}
          onClose={() => setIsEditModalOpen(false)}
          onSaved={onBrandSaved}
        />
      )}
    </div>
  );
}
