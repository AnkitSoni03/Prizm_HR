import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { Activity, Briefcase, Building2, Hash, MapPin, Pencil, Plus, Trash2, Users2 } from 'lucide-react';
import { Tabs } from '../../components/ui/Tabs';
import { Table } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { DetailRow } from '../../components/ui/DetailRow';
import { SearchInput } from '../../components/ui/SearchInput';
import { FilterSelect } from '../../components/ui/FilterSelect';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useAuth } from '../../context/auth-context';
import { useConfirm } from '../../context/confirm-context';
import { useToast } from '../../context/toast-context';
import {
  deleteDepartment,
  deleteDesignation,
  listBrands,
  listDepartments,
  listDesignations,
} from '../../api/companyAdmin/org';
import type { Brand, Department, Designation } from '../../api/tenancy';
import { DepartmentFormModal } from './components/DepartmentFormModal';
import { DesignationFormModal } from './components/DesignationFormModal';

type Tab = 'brands' | 'departments' | 'designations';

function matches(query: string, ...values: (string | null | undefined)[]) {
  if (!query.trim()) return true;
  const needle = query.trim().toLowerCase();
  return values.some((value) => value?.toLowerCase().includes(needle));
}

interface EntityCardProps {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  subtitle?: ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
}

// Mobile card for a simple named entity (Department/Designation) — a
// touch-friendly, professional-looking alternative to the generic
// label/value stacked row Table.tsx falls back to on small screens.
function EntityCard({ icon: Icon, title, subtitle, onEdit, onDelete }: EntityCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow duration-150 active:shadow-md">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">{title}</p>
          {subtitle && <div className="mt-0.5 truncate text-xs text-ink-muted">{subtitle}</div>}
        </div>
      </div>

      {(onEdit || onDelete) && (
        <div className="mt-3.5 flex items-center gap-2 border-t border-border pt-3">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${title}`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-page hover:text-ink"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
              Edit
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete ${title}`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CardListSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

// Low-opacity icons-on-bare-background don't hold up in dark mode (a 20%
// primary tint reads as near-invisible against a near-black page) — instead
// each icon sits at full opacity on the same bg-primary-light/text-primary
// "tile" treatment already proven legible in both themes by every entity
// card's icon avatar on this page.
function OrgFooter() {
  return (
    <div className="mt-8 flex flex-col items-center gap-4 py-10 text-center">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-light text-primary">
          <Users2 className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-light text-primary shadow-sm">
          <div className="absolute inset-0 -z-10 rounded-2xl bg-primary/20 blur-xl" aria-hidden="true" />
          <Building2 className="h-7 w-7" strokeWidth={1.75} />
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-light text-primary">
          <Briefcase className="h-5 w-5" strokeWidth={1.75} />
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">One organization, endless possibilities</p>
        <p className="mt-1 max-w-xs text-xs text-ink-muted">
          Manage brands, departments and designations seamlessly in one place.
        </p>
      </div>
    </div>
  );
}

interface OrganizationPageProps {
  // Brand Admin only ever has their own single brand to look at — a
  // search box and status filter over a one-item list has nothing to do,
  // so Brand Admin's route usage passes this false. Company Admin (and
  // Group Admin's company drill-in) keep it, since they can have many
  // brands.
  showBrandTools?: boolean;
}

export function OrganizationPage({ showBrandTools = true }: OrganizationPageProps) {
  const { hasPermission } = useAuth();
  const confirm = useConfirm();
  const showToast = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('brands');

  const [brands, setBrands] = useState<Brand[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingDepartment, setEditingDepartment] = useState<Department | 'new' | null>(null);
  const [editingDesignation, setEditingDesignation] = useState<Designation | 'new' | null>(null);

  const [brandSearch, setBrandSearch] = useState('');
  const [brandStatusFilter, setBrandStatusFilter] = useState<'' | 'active' | 'inactive'>('');
  const [departmentSearch, setDepartmentSearch] = useState('');
  const [designationSearch, setDesignationSearch] = useState('');

  async function loadAll() {
    setIsLoading(true);
    setError(null);
    try {
      const [b, d, des] = await Promise.all([listBrands(), listDepartments(), listDesignations()]);
      setBrands(b);
      setDepartments(d);
      setDesignations(des);
    } catch {
      setError('Could not load organization data.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
  }, []);

  const filteredBrands = useMemo(
    () =>
      brands.filter(
        (b) =>
          matches(brandSearch, b.name, b.code, b.city, b.state) &&
          (brandStatusFilter === '' || (brandStatusFilter === 'active') === b.isActive),
      ),
    [brands, brandSearch, brandStatusFilter],
  );

  const filteredDepartments = useMemo(
    () => departments.filter((d) => matches(departmentSearch, d.name, d.code)),
    [departments, departmentSearch],
  );

  const filteredDesignations = useMemo(
    () => designations.filter((d) => matches(designationSearch, d.title)),
    [designations, designationSearch],
  );

  async function handleDeleteDepartment(department: Department) {
    const confirmed = await confirm({
      title: 'Delete department',
      message: `Delete department "${department.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteDepartment(department.id);
      loadAll();
    } catch {
      showToast('Could not delete this department — it may still have employees assigned.');
    }
  }

  async function handleDeleteDesignation(designation: Designation) {
    const confirmed = await confirm({
      title: 'Delete designation',
      message: `Delete designation "${designation.title}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteDesignation(designation.id);
      loadAll();
    } catch {
      showToast('Could not delete this designation — it may still have employees assigned.');
    }
  }

  return (
    <div>
      {/* <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-light text-primary">
          <Building2 className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <h1>Organization</h1>
          <p className="text-sm text-ink-muted">Manage your organization structure</p>
        </div>
      </div> */}

      <Tabs
        items={[
          { key: 'brands', label: 'Brands', icon: Building2 },
          { key: 'departments', label: 'Departments', icon: Users2 },
          { key: 'designations', label: 'Designations', icon: Briefcase },
        ]}
        active={activeTab}
        onChange={(key) => setActiveTab(key as Tab)}
      />

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {activeTab === 'brands' && (
        <div>
          {showBrandTools && (
            <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <SearchInput placeholder="Search brands…" value={brandSearch} onChange={setBrandSearch} />
              <FilterSelect
                value={brandStatusFilter}
                onChange={(value) => setBrandStatusFilter(value as typeof brandStatusFilter)}
                placeholder="All statuses"
                ariaLabel="Filter by status"
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                ]}
              />
            </div>
          )}

          {isLoading && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                  <div className="mt-4 space-y-2.5 border-t border-border pt-3.5">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && filteredBrands.length === 0 && (
            <EmptyStateCard
              icon={Building2}
              title={brands.length === 0 ? 'No brands yet' : 'No brands match your search'}
              description={
                brands.length === 0
                  ? 'Brands are created by your Super Admin — reach out to have one added.'
                  : 'Try a different search term or clear the status filter.'
              }
            />
          )}

          {!isLoading && filteredBrands.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredBrands.map((brand) => (
                <div
                  key={brand.id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow duration-150 hover:shadow-md sm:p-5"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
                      <Building2 className="h-5 w-5" strokeWidth={1.75} />
                    </div>
                    <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{brand.name}</p>
                  </div>

                  <div className="mt-4 space-y-2.5 border-t border-border pt-3.5">
                    <DetailRow icon={Building2} label="Name" value={brand.name} />
                    <DetailRow icon={Hash} label="Code" value={brand.code ?? '—'} />
                    <DetailRow
                      icon={MapPin}
                      label="Location"
                      value={[brand.city, brand.state].filter(Boolean).join(', ') || '—'}
                    />
                    <DetailRow
                      icon={Activity}
                      label="Status"
                      value={<Badge tone={brand.isActive ? 'success' : 'neutral'}>{brand.isActive ? 'active' : 'inactive'}</Badge>}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && brands.length > 0 && <OrgFooter />}
        </div>
      )}

      {activeTab === 'departments' && (
        <div>
          <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <SearchInput placeholder="Search departments…" value={departmentSearch} onChange={setDepartmentSearch} />
            {hasPermission('department:create') && (
              <Button variant="secondary" onClick={() => setEditingDepartment('new')}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                Add Department
              </Button>
            )}
          </div>

          <div className="hidden md:block">
            <Table
              isLoading={isLoading}
              rows={filteredDepartments}
              rowKey={(department) => department.id}
              emptyMessage={departments.length === 0 ? 'No departments yet.' : 'No departments match your search.'}
              columns={[
                { key: 'name', header: 'Name', render: (d) => <span className="font-medium text-ink">{d.name}</span> },
                { key: 'code', header: 'Code', render: (d) => d.code ?? '—' },
                {
                  key: 'actions',
                  header: '',
                  className: 'w-24 text-right',
                  render: (department) =>
                    (hasPermission('department:update') || hasPermission('department:delete')) && (
                      <div className="flex justify-end gap-1">
                        {hasPermission('department:update') && (
                          <button
                            type="button"
                            onClick={() => setEditingDepartment(department)}
                            aria-label={`Edit ${department.name}`}
                            className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-ink"
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </button>
                        )}
                        {hasPermission('department:delete') && (
                          <button
                            type="button"
                            onClick={() => handleDeleteDepartment(department)}
                            aria-label={`Delete ${department.name}`}
                            className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </button>
                        )}
                      </div>
                    ),
                },
              ]}
            />
          </div>

          <div className="space-y-3 md:hidden">
            {isLoading && <CardListSkeleton />}

            {!isLoading && filteredDepartments.length === 0 && (
              <EmptyStateCard
                icon={Users2}
                title={departments.length === 0 ? 'No departments yet' : 'No departments match your search'}
                description={
                  departments.length === 0
                    ? 'Add your first department to start organizing employees.'
                    : 'Try a different search term.'
                }
              />
            )}

            {!isLoading &&
              filteredDepartments.map((department) => (
                <EntityCard
                  key={department.id}
                  icon={Users2}
                  title={department.name}
                  subtitle={
                    <span className="flex items-center gap-1">
                      <Hash className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                      {department.code ?? 'No code'}
                    </span>
                  }
                  onEdit={hasPermission('department:update') ? () => setEditingDepartment(department) : undefined}
                  onDelete={hasPermission('department:delete') ? () => handleDeleteDepartment(department) : undefined}
                />
              ))}
          </div>

          {!isLoading && departments.length > 0 && <OrgFooter />}
        </div>
      )}

      {activeTab === 'designations' && (
        <div>
          <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <SearchInput placeholder="Search designations…" value={designationSearch} onChange={setDesignationSearch} />
            {hasPermission('designation:create') && (
              <Button variant="secondary" onClick={() => setEditingDesignation('new')}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                Add Designation
              </Button>
            )}
          </div>

          <div className="hidden md:block">
            <Table
              isLoading={isLoading}
              rows={filteredDesignations}
              rowKey={(designation) => designation.id}
              emptyMessage={designations.length === 0 ? 'No designations yet.' : 'No designations match your search.'}
              columns={[
                { key: 'title', header: 'Title', render: (d) => <span className="font-medium text-ink">{d.title}</span> },
                {
                  key: 'actions',
                  header: '',
                  className: 'w-24 text-right',
                  render: (designation) =>
                    (hasPermission('designation:update') || hasPermission('designation:delete')) && (
                      <div className="flex justify-end gap-1">
                        {hasPermission('designation:update') && (
                          <button
                            type="button"
                            onClick={() => setEditingDesignation(designation)}
                            aria-label={`Edit ${designation.title}`}
                            className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-ink"
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </button>
                        )}
                        {hasPermission('designation:delete') && (
                          <button
                            type="button"
                            onClick={() => handleDeleteDesignation(designation)}
                            aria-label={`Delete ${designation.title}`}
                            className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </button>
                        )}
                      </div>
                    ),
                },
              ]}
            />
          </div>

          <div className="space-y-3 md:hidden">
            {isLoading && <CardListSkeleton />}

            {!isLoading && filteredDesignations.length === 0 && (
              <EmptyStateCard
                icon={Briefcase}
                title={designations.length === 0 ? 'No designations yet' : 'No designations match your search'}
                description={
                  designations.length === 0
                    ? 'Add your first designation to start assigning job titles.'
                    : 'Try a different search term.'
                }
              />
            )}

            {!isLoading &&
              filteredDesignations.map((designation) => (
                <EntityCard
                  key={designation.id}
                  icon={Briefcase}
                  title={designation.title}
                  subtitle={designation.level !== null ? `Level ${designation.level}` : undefined}
                  onEdit={hasPermission('designation:update') ? () => setEditingDesignation(designation) : undefined}
                  onDelete={hasPermission('designation:delete') ? () => handleDeleteDesignation(designation) : undefined}
                />
              ))}
          </div>

          {!isLoading && designations.length > 0 && <OrgFooter />}
        </div>
      )}

      {editingDepartment && (
        <DepartmentFormModal
          department={editingDepartment === 'new' ? undefined : editingDepartment}
          onClose={() => setEditingDepartment(null)}
          onSaved={loadAll}
        />
      )}

      {editingDesignation && (
        <DesignationFormModal
          designation={editingDesignation === 'new' ? undefined : editingDesignation}
          onClose={() => setEditingDesignation(null)}
          onSaved={loadAll}
        />
      )}
    </div>
  );
}
