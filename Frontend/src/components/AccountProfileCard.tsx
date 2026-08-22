import { useState } from 'react';
import { useAuth } from '../context/auth-context';
import type { AuthRole } from '../context/auth-context';
import { Avatar } from './ui/Avatar';
import { PhotoUploadField } from './ui/PhotoUploadField';
import { uploadMyUserPhoto, removeMyUserPhoto } from '../api/auth';
import { useToast } from '../context/toast-context';

function scopeLabel(role: AuthRole): string {
  if (role.brandId) return 'Brand-scoped';
  if (role.companyId) return 'Company-scoped';
  if (role.groupId) return 'Group-scoped';
  return 'Platform-wide';
}

// Shared "who am I" view for portals with no dedicated profile record of
// their own (Super Admin, Group Admin, Company Admin, Brand Admin) —
// unlike ESS, these admin users have no linked Employee, so there's nothing
// richer than the account/role info already carried on the JWT (via
// GET /auth/me) to show. Photo upload/remove (uploadMyUserPhoto/
// removeMyUserPhoto, POST/DELETE /auth/me/photo) mirrors ESS "My Profile"'s
// own employee-photo flow exactly, just backed by users.photo_url instead
// of employees.photo_url — see auth.service.js::uploadMyUserPhoto. Hidden
// for the rare case a caller *does* have a linked Employee (that account
// manages its photo from ESS "My Profile" instead, since the Employee's
// photo always wins when both exist).
export function AccountProfileCard() {
  const { user, refreshUser } = useAuth();
  const showToast = useToast();
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);

  async function handlePhotoSelect(file: File) {
    setIsSavingPhoto(true);
    try {
      await uploadMyUserPhoto(file);
      await refreshUser();
    } catch {
      showToast('Could not upload the photo. Please try again.', 'error');
    } finally {
      setIsSavingPhoto(false);
    }
  }

  async function handlePhotoRemove() {
    setIsSavingPhoto(true);
    try {
      await removeMyUserPhoto();
      await refreshUser();
    } catch {
      showToast('Could not remove the photo. Please try again.', 'error');
    } finally {
      setIsSavingPhoto(false);
    }
  }

  return (
    <div className="max-w-md rounded-xl border border-border bg-card p-5">
      <div className="mb-4">
        {user?.employeeId ? (
          <div className="flex items-center gap-3">
            <Avatar src={user?.photoUrl} alt={user?.email} size="lg" />
            <div>
              <p className="text-sm font-semibold text-ink">{user?.email ?? '—'}</p>
              <p className="text-xs text-ink-muted">Account Profile</p>
            </div>
          </div>
        ) : (
          <PhotoUploadField
            previewUrl={user?.photoUrl}
            onSelect={handlePhotoSelect}
            onRemove={user?.photoUrl ? handlePhotoRemove : undefined}
            isBusy={isSavingPhoto}
            headerContent={
              <div>
                <p className="text-sm font-semibold text-ink">{user?.email ?? '—'}</p>
                <p className="text-xs text-ink-muted">Account Profile</p>
              </div>
            }
          />
        )}
      </div>

      <div className="space-y-2 rounded-xl border border-border bg-page px-4 py-3 text-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Roles</p>
        {user?.roles.map((role) => (
          <div key={`${role.name}-${role.companyId ?? ''}-${role.brandId ?? ''}`} className="flex items-center justify-between gap-3">
            <span className="text-ink">{role.name}</span>
            <span className="text-xs text-ink-muted">{scopeLabel(role)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
