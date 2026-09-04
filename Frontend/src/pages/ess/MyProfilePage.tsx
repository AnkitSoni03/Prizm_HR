import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import axios from 'axios';
import {
  Briefcase,
  CalendarClock,
  Check,
  FileText,
  HelpCircle,
  Layers,
  Pencil,
  RefreshCw,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
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
import { weeklyOffLabel } from '../../utils/weekdays';
import { computeRosterExpiry, daysUntil as daysUntilRosterExpiry, rosterExpiryLabel } from '../../utils/rosterValidity';

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
  probation: 'Probation',
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
      <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted sm:text-xs">{label}</p>
      <p className="mt-0.5 text-xs text-ink sm:mt-1 sm:text-sm">{value}</p>
    </div>
  );
}

function SectionLabel({ icon: Icon, children }: { icon: LucideIcon; children: string }) {
  return (
    <p className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-primary sm:text-xs">
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      {children}
    </p>
  );
}

function RosterCard({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-page px-3 py-2.5 sm:px-4 sm:py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary">
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted sm:text-xs">{label}</p>
        {children}
      </div>
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

  // Same expiry computation as EmployeeDetailModal.tsx's admin-facing view —
  // shown here too so the employee themselves can see how long their own
  // Roster is valid, not just their admin.
  const rosterExpiryDate = profile.rosterGroup?.validityValue
    ? computeRosterExpiry(profile.rosterAssignedAt, profile.rosterGroup.validityValue, profile.rosterGroup.validityUnit)
    : null;
  const rosterExpiryRemaining = rosterExpiryDate ? daysUntilRosterExpiry(rosterExpiryDate) : null;

  // Full manager list — the primary `manager` plus any additional ones (see
  // ManagerCombobox.tsx on the admin side) — deduped by id in case the same
  // person somehow ends up in both. Shows correctly whether there's one,
  // several, or (falling back to effectiveManager) none at all.
  const allManagers = [profile.manager, ...(profile.additionalManagerLinks ?? []).map((link) => link.manager)].filter(
    (m): m is NonNullable<typeof m> => Boolean(m)
  );
  const uniqueManagers = allManagers.filter((m, index) => allManagers.findIndex((other) => other.id === m.id) === index);
  const managerFieldLabel = uniqueManagers.length > 1 ? 'Managers' : 'Manager';
  const managerFieldValue =
    uniqueManagers.length > 0
      ? uniqueManagers.map((m) => m.name || m.employeeCode || 'Unnamed').join(', ')
      : profile.effectiveManager?.name ?? '—';

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
    <div className="space-y-4 sm:space-y-6">
      <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3 border-b border-border pb-5 sm:mb-6 sm:pb-6">
          <div className="min-w-0 flex-1">
            <PhotoUploadField
              headerContent={
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-ink sm:text-lg">{profile.name}</h2>
                  <p className="text-xs text-ink-muted sm:text-sm">{profile.employeeCode ?? 'No code yet'}</p>
                </div>
              }
              previewUrl={profile.photoDownloadUrl}
              onSelect={handlePhotoSelect}
              onRemove={profile.photoDownloadUrl ? handlePhotoRemove : undefined}
              isBusy={isSavingPhoto}
            />
          </div>
          <Badge tone={statusTone(profile.status)}>{profile.status.replace('_', ' ')}</Badge>
        </div>

        <div className="mb-5 sm:mb-6">
          <SectionLabel icon={Briefcase}>Employment Details</SectionLabel>
          <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {profile.brand ? (
              <Field label="Brand" value={profile.brand.name} />
            ) : (
              <Field label="Company" value={profile.company?.name ?? '—'} />
            )}
            <Field label="Department" value={profile.department?.name ?? '—'} />
            <Field label="Designation" value={profile.designation?.title ?? '—'} />
            <Field label={managerFieldLabel} value={managerFieldValue} />
            <Field label="Employment Type" value={EMPLOYMENT_TYPE_LABEL[profile.employmentType]} />
            <Field label="Date of Joining" value={formatDisplayDate(profile.dateOfJoining)} />
            <Field label="Date of Birth" value={formatDisplayDate(profile.dateOfBirth)} />
            <Field label="Work State" value={profile.workState ?? '—'} />
          </div>
        </div>

        <div>
          <SectionLabel icon={Layers}>Roster</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            <RosterCard icon={Users} label="Assigned Roster">
              {profile.rosterGroup ? (
                <>
                  <p className="mt-0.5 text-xs text-ink sm:mt-1 sm:text-sm">{profile.rosterGroup.name}</p>
                  {rosterExpiryRemaining !== null && (
                    <p className="mt-1.5">
                      <Badge tone={rosterExpiryRemaining <= 3 ? 'danger' : rosterExpiryRemaining <= 7 ? 'warning' : 'neutral'}>
                        {rosterExpiryLabel(rosterExpiryRemaining)}
                      </Badge>
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-0.5 text-xs text-ink-muted sm:mt-1 sm:text-sm">
                  None yet — your Shift, Holidays, Company Policies, and Leave Balance will show blank until your
                  admin assigns one.
                </p>
              )}
            </RosterCard>
            <RosterCard icon={CalendarClock} label="Shift">
              {profile.todayRoster?.shift ? (
                <>
                  <p className="mt-0.5 text-xs text-ink sm:mt-1 sm:text-sm">
                    {profile.todayRoster.shift.name} · {profile.todayRoster.shift.startTime.slice(0, 5)}–
                    {profile.todayRoster.shift.endTime.slice(0, 5)}
                    <span className="ml-1.5 text-[10px] text-warning sm:text-xs">(published override)</span>
                  </p>
                  <p className="mt-1 text-[11px] text-ink-muted sm:text-xs">
                    Week Off: {weeklyOffLabel(profile.todayRoster.shift.weeklyOffDays)}
                  </p>
                </>
              ) : profile.defaultShift ? (
                <>
                  <p className="mt-0.5 text-xs text-ink sm:mt-1 sm:text-sm">
                    {profile.defaultShift.name} · {profile.defaultShift.startTime.slice(0, 5)}–
                    {profile.defaultShift.endTime.slice(0, 5)}
                  </p>
                  <p className="mt-1 text-[11px] text-ink-muted sm:text-xs">
                    Week Off: {weeklyOffLabel(profile.defaultShift.weeklyOffDays)}
                  </p>
                </>
              ) : (
                <p className="mt-0.5 text-xs text-ink-muted sm:mt-1 sm:text-sm">Following your Roster&apos;s shift</p>
              )}
            </RosterCard>
            <RosterCard icon={RefreshCw} label="Comp-Off">
              {profile.compOffPolicy ? (
                <p className="mt-0.5 text-xs sm:mt-1 sm:text-sm">
                  <Badge tone="success">Active</Badge>
                  <span className="ml-1.5 text-ink-muted">{profile.compOffPolicy.name}</span>
                </p>
              ) : (
                <p className="mt-0.5 text-xs sm:mt-1 sm:text-sm">
                  <Badge tone="neutral">Not Enrolled</Badge>
                </p>
              )}
            </RosterCard>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2.5 rounded-lg bg-primary-light px-3.5 py-2.5 sm:mt-6 sm:px-4 sm:py-3">
          <HelpCircle className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
          <p className="text-[11px] text-ink-muted sm:text-xs">
            Need something updated here? Reach out to your Company Admin or HR team — profile changes aren&apos;t
            self-service.
          </p>
        </div>
      </div>

      {pendingRequests.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 sm:p-5">
          <h3 className="mb-3 text-xs font-semibold text-ink sm:text-sm">Documents Requested</h3>
          <div className="space-y-2">
            {pendingRequests.map((request) => (
              <div
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2 sm:px-4 sm:py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-ink sm:text-sm">{request.documentType}</p>
                  {request.note && <p className="text-[11px] text-ink-muted sm:text-xs">{request.note}</p>}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleDoneRequest(request)}
                  isLoading={completingRequestId === request.id}
                  className="px-3 py-1.5 text-xs sm:text-sm"
                >
                  Done
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-xs font-semibold text-ink sm:text-sm">My Documents</h3>
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
            className="mt-4 space-y-3 rounded-xl border border-border bg-card p-4 sm:space-y-4 sm:p-5"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted sm:text-xs">
              Upload a Document
            </p>
            {docUploadError && <p className="text-xs text-danger sm:text-sm">{docUploadError}</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="my-doc-type"
                label="Type"
                required
                compact
                value={docType}
                onChange={(event) => setDocType(event.target.value)}
                placeholder="e.g. PAN Card"
              />
              <FileUploadField file={docFile} onSelect={setDocFile} disabled={isUploadingDoc} compact />
            </div>
            <p className="text-[11px] text-ink-muted sm:text-xs">
              Once uploaded, it'll show as "Pending" until an admin or a document verifier reviews it — you'll get
              a notification either way. You can edit the title or delete it any time before it's verified.
            </p>
            <div className="flex justify-end">
              <Button
                type="submit"
                variant="secondary"
                isLoading={isUploadingDoc}
                disabled={!docType || !docFile}
                className="px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm"
              >
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
