import { useState } from 'react';
import { Check, Copy, Mail } from 'lucide-react';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import type { AdminInvitation, InviteResult } from '../../../api/tenancy';

interface AdminInvitationPanelProps {
  roleLabel: string;
  // undefined = still loading, null = never invited.
  invitation: AdminInvitation | null | undefined;
  onInvite: (email: string) => Promise<InviteResult>;
  onInvited: (invitation: AdminInvitation) => void;
}

function statusTone(status: AdminInvitation['status']) {
  if (status === 'active') return 'success';
  if (status === 'disabled') return 'danger';
  return 'warning';
}

// Shown inside each Edit*Modal so a Super Admin can see whether a Group/
// Company/Brand's first admin was ever invited (and its email) instead of
// only ever seeing a blank "invite" form — a "Skip for now" during creation
// used to leave no way to tell, or to follow up, from the card alone.
export function AdminInvitationPanel({ roleLabel, invitation, onInvite, onInvited }: AdminInvitationPanelProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activationUrl, setActivationUrl] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  async function handleCopy() {
    if (!activationUrl) return;
    await navigator.clipboard.writeText(activationUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }

  async function handleInvite() {
    if (!email) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await onInvite(email);
      onInvited({ email, status: 'invited' });
      if (result.activationToken) {
        setActivationUrl(`${window.location.origin}/activate?token=${encodeURIComponent(result.activationToken)}`);
      }
    } catch {
      setError('Could not send the invite. This email may already be in use.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-page p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{roleLabel}</p>

      {invitation === undefined && <p className="text-sm text-ink-muted">Loading…</p>}

      {activationUrl && (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">
            Invitation sent to <span className="font-medium text-ink">{email}</span>.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
            <a
              href={activationUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 truncate text-xs text-primary hover:underline"
            >
              {activationUrl}
            </a>
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy activation link"
              className="shrink-0 rounded-md p-1 text-ink-muted hover:bg-page hover:text-ink"
            >
              {isCopied ? (
                <Check className="h-3.5 w-3.5 text-success" strokeWidth={1.75} />
              ) : (
                <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
              )}
            </button>
          </div>
        </div>
      )}

      {invitation === null && !activationUrl && (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">No admin has been invited yet.</p>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                id="admin-invite-email"
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@company.com"
              />
            </div>
            <Button type="button" onClick={handleInvite} isLoading={isSubmitting} disabled={!email}>
              Send Invite
            </Button>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}

      {invitation && !activationUrl && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-ink-muted" strokeWidth={1.75} />
            <span className="text-sm text-ink">{invitation.email}</span>
          </div>
          <Badge tone={statusTone(invitation.status)}>{invitation.status}</Badge>
        </div>
      )}
    </div>
  );
}
