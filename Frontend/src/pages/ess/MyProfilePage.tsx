import { useEffect, useState, type FormEvent } from 'react';
import axios from 'axios';
import { Check, FileText, Pencil, Trash2, X } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Table } from '../../components/ui/Table';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { PhotoUploadField } from '../../components/ui/PhotoUploadField';
import { FileUploadField } from '../../components/ui/FileUploadField';
import { FilePreviewModal } from '../../components/ui/FilePreviewModal';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useAuth } from '../../context/auth-context';
import { useToast } from '../../context/toast-context';
import {
  getMyProfile,
  listMyDocuments,
  uploadMyDocument,
  updateMyDocument,
  deleteMyDocument,
  listMyDocumentRequests,
  completeMyDocumentRequest,
  type EmployeeDocument,
  type EmployeeProfile,
  type DocumentUploadRequest,
} from '../../api/ess/profile';
import { uploadMyPhoto, removeMyPhoto } from '../../api/myPhoto';
import { holidayAuditName } from '../../api/companyAdmin/holidays';
import { formatDisplayDate, formatDisplayDateTime } from '../../utils/dateDisplay';

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
    return err.response.data.error;
  }
  return fallback;
}

const EMPLOYMENT_TYPE_LABEL: Record<EmployeeProfile['employmentType'], string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
};

function statusTone(status: EmployeeProfile['status']) {
  if (status === 'active') return 'success' as const;
  if (status === 'onboarding' || status === 'on_notice') return 'warning' as const;
  return 'neutral' as const;
}

function docStatusTone(status: EmployeeDocument['status']) {
  if (status === 'verified') return 'success' as const;
  if (status === 'rejected') return 'danger' as const;
  return 'warning' as const;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 text-sm text-ink">{value}</p>
    </div>
  );
}

export function MyProfilePage() {
  const { user, hasPermission, refreshUser } = useAuth();
  const canUploadDocs = hasPermission('employee_document:upload_own');
  const showToast = useToast();
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [documentRequests, setDocumentRequests] = useState<DocumentUploadRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);

  const [docType, setDocType] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [docUploadError, setDocUploadError] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<EmployeeDocument | null>(null);

  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editingDocType, setEditingDocType] = useState('');
  const [isSavingDocType, setIsSavingDocType] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [completingRequestId, setCompletingRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.employeeId) return;
    Promise.all([getMyProfile(user.employeeId), listMyDocuments(user.employeeId), listMyDocumentRequests(user.employeeId)])
      .then(([p, docs, requests]) => {
        setProfile(p);
        setDocuments(docs);
        setDocumentRequests(requests);
      })
      .catch(() => setError('Could not load your profile.'));
  }, [user?.employeeId]);

  const pendingRequests = documentRequests.filter((r) => r.status === 'pending');

  if (!user?.employeeId) {
    return (
      <EmptyStateCard
        icon={FileText}
        title="No employee record linked"
        description="Your account isn't linked to an employee record yet. Contact your HR team to get set up."
      />
    );
  }

  if (error) {
    return <p className="text-sm text-danger">{error}</p>;
  }

  if (!profile) {
    return <p className="text-sm text-ink-muted">Loading…</p>;
  }

  async function handlePhotoSelect(file: File) {
    setIsSavingPhoto(true);
    try {
      const updated = await uploadMyPhoto(file);
      setProfile((prev) => (prev ? { ...prev, photoDownloadUrl: updated.photoDownloadUrl } : prev));
      await refreshUser();
    } catch {
      showToast('Could not upload the photo. Please try again.');
    } finally {
      setIsSavingPhoto(false);
    }
  }

  async function handlePhotoRemove() {
    setIsSavingPhoto(true);
    try {
      const updated = await removeMyPhoto();
      setProfile((prev) => (prev ? { ...prev, photoDownloadUrl: updated.photoDownloadUrl } : prev));
      await refreshUser();
    } catch {
      showToast('Could not remove the photo. Please try again.');
    } finally {
      setIsSavingPhoto(false);
    }
  }

  // Independent of any request below — a request is just a reminder note;
  // the actual file always goes through this same form regardless of
  // whether it's fulfilling a request or not.
  async function handleUploadDocument(event: FormEvent) {
    event.preventDefault();
    if (!user?.employeeId || !docType || !docFile) return;

    setIsUploadingDoc(true);
    setDocUploadError(null);
    try {
      const doc = await uploadMyDocument(user.employeeId, { type: docType, file: docFile });
      setDocuments((prev) => [...prev, doc]);
      setDocType('');
      setDocFile(null);
    } catch (err) {
      setDocUploadError(extractError(err, 'Could not upload this document. Please try again.'));
    } finally {
      setIsUploadingDoc(false);
    }
  }

  async function handleDoneRequest(request: DocumentUploadRequest) {
    if (!user?.employeeId) return;
    setCompletingRequestId(request.id);
    try {
      await completeMyDocumentRequest(user.employeeId, request.id);
      setDocumentRequests((prev) => prev.filter((r) => r.id !== request.id));
    } catch {
      showToast('Could not dismiss this request. Please try again.');
    } finally {
      setCompletingRequestId(null);
    }
  }

  function handleStartEditDoc(doc: EmployeeDocument) {
    setEditingDocId(doc.id);
    setEditingDocType(doc.type);
  }

  async function handleSaveDocType(doc: EmployeeDocument) {
    if (!user?.employeeId) return;
    if (!editingDocType.trim() || editingDocType === doc.type) {
      setEditingDocId(null);
      return;
    }
    setIsSavingDocType(true);
    try {
      const updated = await updateMyDocument(user.employeeId, doc.id, editingDocType.trim());
      setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setEditingDocId(null);
    } catch {
      showToast('Could not update this document. Please try again.');
    } finally {
      setIsSavingDocType(false);
    }
  }

  async function handleDeleteDoc(doc: EmployeeDocument) {
    if (!user?.employeeId) return;
    setDeletingDocId(doc.id);
    try {
      await deleteMyDocument(user.employeeId, doc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch {
      showToast('Could not delete this document. Please try again.');
    } finally {
      setDeletingDocId(null);
    }
  }

  return (
    <>
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">{profile.name}</h2>
            <p className="text-sm text-ink-muted">{profile.employeeCode}</p>
          </div>
          <Badge tone={statusTone(profile.status)}>{profile.status.replace('_', ' ')}</Badge>
        </div>

        <div className="mb-5">
          <PhotoUploadField
            previewUrl={profile.photoDownloadUrl}
            onSelect={handlePhotoSelect}
            onRemove={profile.photoDownloadUrl ? handlePhotoRemove : undefined}
            isBusy={isSavingPhoto}
          />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Brand" value={profile.brand?.name ?? '—'} />
          <Field label="Department" value={profile.department?.name ?? '—'} />
          <Field label="Designation" value={profile.designation?.title ?? '—'} />
          <Field label="Manager" value={profile.manager?.name ?? '—'} />
          <Field label="Employment Type" value={EMPLOYMENT_TYPE_LABEL[profile.employmentType]} />
          <Field label="Date of Joining" value={formatDisplayDate(profile.dateOfJoining)} />
        </div>

        <p className="mt-5 text-xs text-ink-muted">
          Need something updated here? Reach out to your Company Admin or HR team — profile changes aren&apos;t
          self-service.
        </p>
      </div>

      {pendingRequests.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-5">
          <h3 className="mb-3 text-sm font-semibold text-ink">Documents Requested</h3>
          <div className="space-y-2">
            {pendingRequests.map((request) => (
              <div
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium text-ink">{request.documentType}</p>
                  {request.note && <p className="text-xs text-ink-muted">{request.note}</p>}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleDoneRequest(request)}
                  isLoading={completingRequestId === request.id}
                >
                  Done
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink">My Documents</h3>
        <Table
          rows={documents}
          rowKey={(d) => d.id}
          emptyMessage="No documents on file yet."
          columns={[
            {
              key: 'type',
              header: 'Type',
              render: (d) =>
                editingDocId === d.id ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={editingDocType}
                      onChange={(event) => setEditingDocType(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') handleSaveDocType(d);
                        if (event.key === 'Escape') setEditingDocId(null);
                      }}
                      className="w-32 rounded-lg border border-border px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveDocType(d)}
                      disabled={isSavingDocType}
                      aria-label="Save"
                      className="shrink-0 rounded-md p-1 text-ink-muted hover:bg-page hover:text-success disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingDocId(null)}
                      aria-label="Cancel"
                      className="shrink-0 rounded-md p-1 text-ink-muted hover:bg-page hover:text-ink"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </div>
                ) : (
                  d.type
                ),
            },
            {
              key: 'file',
              header: 'File',
              render: (d) =>
                d.fileDownloadUrl ? (
                  <button
                    type="button"
                    onClick={() => setPreviewDoc(d)}
                    className="font-medium text-primary hover:underline"
                  >
                    View
                  </button>
                ) : (
                  <span className="text-ink-muted">Unavailable</span>
                ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (d) => (
                <div>
                  <Badge tone={docStatusTone(d.status)}>
                    {d.status === 'verified' ? 'Verified' : d.status === 'rejected' ? 'Rejected' : 'Pending'}
                  </Badge>
                  {d.status === 'rejected' && d.rejectionReason && (
                    <p className="mt-0.5 max-w-xs text-xs text-danger">{d.rejectionReason}</p>
                  )}
                </div>
              ),
            },
            {
              key: 'decidedBy',
              header: 'Decided By',
              render: (d) =>
                d.status !== 'pending' ? (
                  <span className="text-ink-muted">
                    {holidayAuditName(d.verifier) ?? '—'}
                    {d.verifiedAt && (
                      <span className="block text-xs text-ink-muted">{formatDisplayDateTime(d.verifiedAt)}</span>
                    )}
                  </span>
                ) : (
                  <span className="text-ink-muted">—</span>
                ),
            },
            {
              key: 'actions',
              header: '',
              render: (d) =>
                canUploadDocs && d.status !== 'verified' && editingDocId !== d.id ? (
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => handleStartEditDoc(d)}
                      aria-label={`Edit ${d.type}`}
                      title="Edit title"
                      className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-ink"
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDoc(d)}
                      disabled={deletingDocId === d.id}
                      aria-label={`Delete ${d.type}`}
                      title="Delete"
                      className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                ) : null,
            },
          ]}
        />

        {canUploadDocs && (
          <form
            onSubmit={handleUploadDocument}
            className="mt-4 space-y-4 rounded-xl border border-border bg-card p-5"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Upload a Document</p>
            {docUploadError && <p className="text-sm text-danger">{docUploadError}</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="my-doc-type"
                label="Type"
                required
                value={docType}
                onChange={(event) => setDocType(event.target.value)}
                placeholder="e.g. PAN Card"
              />
              <FileUploadField file={docFile} onSelect={setDocFile} disabled={isUploadingDoc} />
            </div>
            <p className="text-xs text-ink-muted">
              Once uploaded, it'll show as "Pending" until an admin or a document verifier reviews it — you'll get
              a notification either way. You can edit the title or delete it any time before it's verified.
            </p>
            <div className="flex justify-end">
              <Button type="submit" variant="secondary" isLoading={isUploadingDoc} disabled={!docType || !docFile}>
                Upload Document
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
    {previewDoc && (
      <FilePreviewModal
        title={previewDoc.type}
        fileUrl={previewDoc.fileUrl}
        previewUrl={previewDoc.fileDownloadUrl}
        downloadUrl={previewDoc.fileAttachmentUrl}
        onClose={() => setPreviewDoc(null)}
      />
    )}
    </>
  );
}
