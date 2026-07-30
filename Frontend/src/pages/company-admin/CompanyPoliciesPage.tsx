import { useEffect, useState } from 'react';
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useAuth } from '../../context/auth-context';
import { useConfirm } from '../../context/confirm-context';
import { useToast } from '../../context/toast-context';
import { holidayAuditName as policyAuditName } from '../../api/companyAdmin/holidays';
import {
  deleteCompanyPolicy,
  listCompanyPolicies,
  type CompanyPolicy,
} from '../../api/companyAdmin/companyPolicies';
import { PolicyFormModal } from './components/PolicyFormModal';
import { FilePreviewModal } from '../../components/ui/FilePreviewModal';

interface CompanyPoliciesPageProps {
  // Set by the Group Admin portal's read-only company drill-in — same
  // pattern as ApprovalsPage.tsx's extraParams.
  extraParams?: { companyId?: string };
}

export function CompanyPoliciesPage({ extraParams = {} }: CompanyPoliciesPageProps = {}) {
  const { hasPermission } = useAuth();
  const confirm = useConfirm();
  const showToast = useToast();
  const canCreate = hasPermission('company_policy:create');
  const canUpdate = hasPermission('company_policy:update');
  const canDelete = hasPermission('company_policy:delete');

  const [policies, setPolicies] = useState<CompanyPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPolicy, setEditingPolicy] = useState<CompanyPolicy | 'new' | null>(null);
  const [previewPolicy, setPreviewPolicy] = useState<CompanyPolicy | null>(null);

  async function loadPolicies() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listCompanyPolicies(extraParams);
      setPolicies(result.data);
    } catch {
      setError('Could not load company policies.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPolicies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraParams.companyId]);

  async function handleDelete(policy: CompanyPolicy) {
    const confirmed = await confirm({
      title: 'Delete policy',
      message: `Delete policy "${policy.title}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteCompanyPolicy(policy.id);
      loadPolicies();
    } catch {
      showToast('Could not delete this policy.');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Company policies are visible to every employee.
        </p>
        {canCreate && (
          <Button onClick={() => setEditingPolicy('new')}>
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add Policy
          </Button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && !error && policies.length === 0 && (
        <EmptyStateCard
          icon={FileText}
          title="No policies yet"
          description="Add company policies (WFH, code of conduct, etc.) for employees to reference."
        />
      )}

      {(isLoading || policies.length > 0) && (
        <Table
          isLoading={isLoading}
          rows={policies}
          rowKey={(policy) => policy.id}
          columns={[
            { key: 'title', header: 'Title', render: (p) => <span className="font-medium text-ink">{p.title}</span> },
            {
              key: 'body',
              header: 'Description',
              render: (p) => <span className="line-clamp-2 text-ink-muted">{p.body ?? '—'}</span>,
            },
            {
              key: 'fileUrl',
              header: 'Attachment',
              render: (p) =>
                p.fileDownloadUrl ? (
                  <button
                    type="button"
                    onClick={() => setPreviewPolicy(p)}
                    className="text-primary hover:underline"
                  >
                    View file
                  </button>
                ) : (
                  '—'
                ),
            },
            {
              key: 'record',
              header: 'Record',
              render: (p) => {
                const createdByName = policyAuditName(p.creator);
                const updatedByName = policyAuditName(p.updater);
                return (
                  <div className="text-xs text-ink-muted">
                    {createdByName && <p>Created by {createdByName}</p>}
                    {updatedByName && <p>Last edited by {updatedByName}</p>}
                    {!createdByName && !updatedByName && '—'}
                  </div>
                );
              },
            },
            {
              key: 'actions',
              header: '',
              className: 'w-24 text-right',
              render: (policy) =>
                (canUpdate || canDelete) && (
                  <div className="flex justify-end gap-1">
                    {canUpdate && (
                      <button
                        type="button"
                        onClick={() => setEditingPolicy(policy)}
                        aria-label={`Edit ${policy.title}`}
                        className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-ink"
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(policy)}
                        aria-label={`Delete ${policy.title}`}
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
      )}

      {editingPolicy && (
        <PolicyFormModal
          policy={editingPolicy === 'new' ? undefined : editingPolicy}
          onClose={() => setEditingPolicy(null)}
          onSaved={loadPolicies}
        />
      )}

      {previewPolicy && (
        <FilePreviewModal
          title={previewPolicy.title}
          fileUrl={previewPolicy.fileUrl}
          previewUrl={previewPolicy.fileDownloadUrl}
          downloadUrl={previewPolicy.fileAttachmentUrl}
          onClose={() => setPreviewPolicy(null)}
        />
      )}
    </div>
  );
}
