import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Tabs } from '../../components/ui/Tabs';
import { Table } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../context/auth-context';
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

export function OrganizationPage() {
  const { hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('brands');

  const [brands, setBrands] = useState<Brand[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingDepartment, setEditingDepartment] = useState<Department | 'new' | null>(null);
  const [editingDesignation, setEditingDesignation] = useState<Designation | 'new' | null>(null);

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

  async function handleDeleteDepartment(department: Department) {
    if (!window.confirm(`Delete department "${department.name}"? This cannot be undone.`)) return;
    try {
      await deleteDepartment(department.id);
      loadAll();
    } catch {
      window.alert('Could not delete this department — it may still have employees assigned.');
    }
  }

  async function handleDeleteDesignation(designation: Designation) {
    if (!window.confirm(`Delete designation "${designation.title}"? This cannot be undone.`)) return;
    try {
      await deleteDesignation(designation.id);
      loadAll();
    } catch {
      window.alert('Could not delete this designation — it may still have employees assigned.');
    }
  }

  return (
    <div>
      <Tabs
        items={[
          { key: 'brands', label: 'Brands' },
          { key: 'departments', label: 'Departments' },
          { key: 'designations', label: 'Designations' },
        ]}
        active={activeTab}
        onChange={(key) => setActiveTab(key as Tab)}
      />

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {activeTab === 'brands' && (
        <Table
          isLoading={isLoading}
          rows={brands}
          rowKey={(brand) => brand.id}
          emptyMessage="No brands yet — brands are created by your Super Admin."
          columns={[
            { key: 'name', header: 'Name', render: (b) => <span className="font-medium text-ink">{b.name}</span> },
            { key: 'code', header: 'Code', render: (b) => b.code ?? '—' },
            {
              key: 'location',
              header: 'Location',
              render: (b) => [b.city, b.state].filter(Boolean).join(', ') || '—',
            },
            {
              key: 'status',
              header: 'Status',
              render: (b) => <Badge tone={b.isActive ? 'success' : 'neutral'}>{b.isActive ? 'active' : 'inactive'}</Badge>,
            },
          ]}
        />
      )}

      {activeTab === 'departments' && (
        <div>
          {hasPermission('department:create') && (
            <div className="mb-3 flex justify-end">
              <Button variant="secondary" onClick={() => setEditingDepartment('new')}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                Add Department
              </Button>
            </div>
          )}
          <Table
            isLoading={isLoading}
            rows={departments}
            rowKey={(department) => department.id}
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
      )}

      {activeTab === 'designations' && (
        <div>
          {hasPermission('designation:create') && (
            <div className="mb-3 flex justify-end">
              <Button variant="secondary" onClick={() => setEditingDesignation('new')}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                Add Designation
              </Button>
            </div>
          )}
          <Table
            isLoading={isLoading}
            rows={designations}
            rowKey={(designation) => designation.id}
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
