import { useEffect, useState, type FormEvent } from 'react';
import axios from 'axios';
import { FileText } from 'lucide-react';
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
  type EmployeeDocument,
  type EmployeeProfile,
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
  const [error, setError] = useState<string | null>(null);
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);

  const [docType, setDocType] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [docUploadError, setDocUploadError] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<EmployeeDocument | null>(null);

  useEffect(() => {
    if (!user?.employeeId) return;
    Promise.all([getMyProfile(user.employeeId), listMyDocuments(user.employeeId)])
      .then(([p, docs]) => {
        setProfile(p);
        setDocuments(docs);
      })
      .catch(() => setError('Could not load your profile.'));
  }, [user?.employeeId]);

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

      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink">My Documents</h3>
        <Table
          rows={documents}
          rowKey={(d) => d.id}
          emptyMessage="No documents on file yet."
          columns={[
            { key: 'type', header: 'Type', render: (d) => d.type },
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
              key: 'verified',
              header: 'Verified',
              render: (d) => (
                <Badge
                  tone={d.verified ? 'success' : 'neutral'}
                  title={d.verified ? `Verified by ${holidayAuditName(d.verifier) ?? 'someone no longer in the system'}` : undefined}
                >
                  {d.verified ? 'Verified' : 'Pending'}
                </Badge>
              ),
            },
            {
              key: 'verifiedBy',
              header: 'Verified By',
              render: (d) =>
                d.verified ? (
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
              a notification when it's verified.
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
