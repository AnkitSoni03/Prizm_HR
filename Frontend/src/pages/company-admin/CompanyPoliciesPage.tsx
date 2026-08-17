import { useEffect, useState } from 'react';
import { CheckCircle2, Download, Eye, FileText, Info, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../context/auth-context';
import { useConfirm } from '../../context/confirm-context';
import { useToast } from '../../context/toast-context';
import { useTheme } from '../../context/theme-context';
import { getChartPalette } from '../../utils/chartColors';
import { holidayAuditName as policyAuditName } from '../../api/companyAdmin/holidays';
import {
  deleteCompanyPolicy,
  listCompanyPolicies,
  type CompanyPolicy,
} from '../../api/companyAdmin/companyPolicies';
import { PolicyFormModal } from './components/PolicyFormModal';
import { FilePreviewModal } from '../../components/ui/FilePreviewModal';
import { getFileKind } from '../../utils/fileKind';
import { pickPolicyIcon } from '../../utils/policyIcon';

interface CompanyPoliciesPageProps {
  // companyId: set by the Group Admin portal's read-only company drill-in —
  // same pattern as ApprovalsPage.tsx's extraParams. rosterGroupId: set by
  // ESS's own route to filter to company-wide + the caller's own Roster.
  extraParams?: { companyId?: string; rosterGroupId?: string };
}

const FILE_KIND_LABEL: Record<ReturnType<typeof getFileKind>, string> = {
  pdf: 'PDF Document',
  image: 'Image',
  doc: 'Word Document',
  other: 'File',
};

const IMPORTANT_POINTS = [
  'Every employee is expected to read and follow the policies listed here.',
  'Policies can be updated at any time by HR/Admin — always check the version shown here rather than a saved or printed copy.',
  'If anything in a policy is unclear, reach out to HR or your manager for clarification.',
  'Compliance with these policies is mandatory for everyone, regardless of role or department.',
];

export function CompanyPoliciesPage({ extraParams = {} }: CompanyPoliciesPageProps = {}) {
  const { hasPermission } = useAuth();
  const { theme } = useTheme();
  const palette = getChartPalette(theme);
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
  }, [extraParams.companyId, extraParams.rosterGroupId]);

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
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <FileText className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
          {policies.length > 0 ? `${policies.length} polic${policies.length === 1 ? 'y' : 'ies'} — ` : ''}
          visible to every employee.
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

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-5">
              <Skeleton className="mb-3 h-5 w-1/2" />
              <Skeleton className="mb-2 h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && policies.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {policies.map((policy) => {
            const createdByName = policyAuditName(policy.creator);
            const updatedByName = policyAuditName(policy.updater);
            const kind = policy.fileUrl ? getFileKind(policy.fileUrl) : null;
            const { icon: PolicyIcon, colorIndex } = pickPolicyIcon(policy.title, policy.id);
            const iconColor = palette.categorical[colorIndex];

            return (
              <div
                key={policy.id}
                className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-xs transition-shadow duration-150 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${iconColor}1f`, color: iconColor }}
                  >
                    <PolicyIcon className="h-6 w-6" strokeWidth={1.75} />
                  </div>
                  {(canUpdate || canDelete) && (
                    <div className="flex shrink-0 items-center gap-1">
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
                  )}
                </div>

                <h3 className="mt-4 text-lg font-bold text-ink">{policy.title}</h3>
                <p className="mt-2 line-clamp-3 text-sm text-ink-muted">
                  {policy.body ?? 'No description added yet.'}
                </p>

                <div className="my-4 border-t border-border" />

                {policy.fileDownloadUrl ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewPolicy(policy)}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary-light px-3 py-2 text-sm font-semibold text-primary transition-colors hover:brightness-95"
                      >
                        <Eye className="h-4 w-4" strokeWidth={1.75} />
                        View
                      </button>
                      {policy.fileAttachmentUrl && (
                        <a
                          href={policy.fileAttachmentUrl}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-primary/30 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary-light"
                        >
                          <Download className="h-4 w-4" strokeWidth={1.75} />
                          Download
                        </a>
                      )}
                    </div>
                    {kind && (
                      <span className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-lg bg-page px-2.5 py-1 text-xs font-medium text-ink-muted">
                        <FileText className="h-3.5 w-3.5 text-danger" strokeWidth={1.75} />
                        {FILE_KIND_LABEL[kind]}
                      </span>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-ink-muted">No attachment added yet.</p>
                )}

                {(createdByName || updatedByName) && (
                  <div className="mt-4 border-t border-border pt-3 text-xs text-ink-muted">
                    {createdByName && <p>Created by {createdByName}</p>}
                    {updatedByName && <p>Last edited by {updatedByName}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && policies.length > 0 && (
        <div className="mt-6 rounded-2xl border border-primary/20 bg-primary-light p-5">
          <div className="mb-3 flex items-center gap-2">
            <Info className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.75} />
            <h3 className="text-base font-bold text-ink">Important Information</h3>
          </div>
          <ul className="space-y-2">
            {IMPORTANT_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2 text-sm text-ink">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
                {point}
              </li>
            ))}
          </ul>
        </div>
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
