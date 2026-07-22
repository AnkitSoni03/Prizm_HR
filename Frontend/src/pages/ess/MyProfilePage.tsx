import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Table } from '../../components/ui/Table';
import { PhotoUploadField } from '../../components/ui/PhotoUploadField';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useAuth } from '../../context/auth-context';
import { useToast } from '../../context/toast-context';
import { getMyProfile, listMyDocuments, type EmployeeDocument, type EmployeeProfile } from '../../api/ess/profile';
import { uploadMyPhoto, removeMyPhoto } from '../../api/myPhoto';
import { formatDisplayDate } from '../../utils/dateDisplay';

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
  const { user, refreshUser } = useAuth();
  const showToast = useToast();
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);

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

  return (
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
              render: (d) => (
                <a
                  href={d.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  View
                </a>
              ),
            },
            {
              key: 'verified',
              header: 'Verified',
              render: (d) => <Badge tone={d.verified ? 'success' : 'neutral'}>{d.verified ? 'Verified' : 'Pending'}</Badge>,
            },
          ]}
        />
      </div>
    </div>
  );
}
