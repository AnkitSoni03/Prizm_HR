import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useAuth } from '../context/auth-context';
import type { AuthRole } from '../context/auth-context';
import { Avatar } from './ui/Avatar';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { PhotoUploadField } from './ui/PhotoUploadField';
import { uploadMyUserPhoto, removeMyUserPhoto, updateMyName } from '../api/auth';
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

  // Admin-only accounts have no linked Employee, so — unlike an Employee's
  // name (never self-service, per CLAUDE.md) — this is the one place an
  // admin can set their own display name instead of the Topbar/sidebar
  // falling back to their raw email (see auth.service.js::getCurrentUser).
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(user?.name ?? '');
  const [isSavingName, setIsSavingName] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNameDraft(user?.name ?? '');
  }, [user?.name]);

  async function handleSaveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    setIsSavingName(true);
    try {
      await updateMyName(trimmed);
      await refreshUser();
      setIsEditingName(false);
    } catch {
      showToast('Could not save your name. Please try again.', 'error');
    } finally {
      setIsSavingName(false);
    }
  }

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
              isEditingName ? (
                <div className="flex flex-wrap items-end gap-2">
                  <Input
                    id="account-name"
                    label="Name"
                    compact
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    placeholder="Your name"
                  />
                  <Button
                    onClick={handleSaveName}
                    isLoading={isSavingName}
                    disabled={!nameDraft.trim()}
                    className="!px-3 !py-1.5 !text-xs"
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setIsEditingName(false);
                      setNameDraft(user?.name ?? '');
                    }}
                    className="!px-3 !py-1.5 !text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-ink">{user?.name || user?.email || '—'}</p>
                    <button
                      type="button"
                      onClick={() => setIsEditingName(true)}
                      aria-label="Edit name"
                      className="text-ink-muted hover:text-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                  <p className="text-xs text-ink-muted">{user?.name ? user?.email : 'Account Profile'}</p>
                </div>
              )
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
