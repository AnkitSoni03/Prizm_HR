import type { KeyboardEvent, MouseEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { EditGroupModal } from './EditGroupModal';
import { useConfirm } from '../../../context/confirm-context';
import { useToast } from '../../../context/toast-context';
import { deleteGroup, type Group, type Plan } from '../../../api/tenancy';

interface GroupCardProps {
  group: Group;
  plans: Plan[];
  canDeleteGroup: boolean;
  canEditGroup: boolean;
  onDeleted: () => void;
  onSaved: () => void;
}

// A clickable summary card only, same pattern as CompanyCard — Companies
// underneath this Group live on the dedicated detail page at
// /super-admin/groups/:id (GroupDetailPage) instead of expanding inline here.
export function GroupCard({ group, plans, canDeleteGroup, canEditGroup, onDeleted, onSaved }: GroupCardProps) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const showToast = useToast();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const planName = plans.find((plan) => plan.id === group.planId)?.name ?? '—';
  const detailPath = `/super-admin/groups/${group.id}`;

  function goToDetail() {
    navigate(detailPath);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      goToDetail();
    }
  }

  function handleOpenEdit(event: MouseEvent) {
    event.stopPropagation();
    setIsEditModalOpen(true);
  }

  async function handleDelete(event: MouseEvent) {
    event.stopPropagation();
    const confirmed = await confirm({
      title: 'Delete group',
      message: `Delete group "${group.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteGroup(group.id);
      onDeleted();
    } catch {
      showToast('Could not delete this group — it may still have active companies under it.');
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={goToDetail}
      onKeyDown={handleKeyDown}
      className="flex cursor-pointer flex-col items-start gap-3 rounded-xl border border-border bg-card p-5 text-left shadow-sm transition-colors hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex w-full items-start justify-between gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Layers className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={group.status === 'active' ? 'success' : 'danger'}>{group.status}</Badge>
          {canEditGroup && (
            <button
              type="button"
              onClick={handleOpenEdit}
              aria-label={`Edit ${group.name}`}
              title="Edit Group"
              className="rounded-md p-1.5 text-ink-muted hover:bg-primary/10 hover:text-primary"
            >
              <Pencil className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
          {canDeleteGroup && (
            <button
              type="button"
              onClick={handleDelete}
              aria-label={`Delete ${group.name}`}
              className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">{group.name}</p>
        <p className="mt-1 text-xs text-ink-muted">Plan: {planName}</p>
      </div>

      {isEditModalOpen && (
        <div onClick={(event) => event.stopPropagation()}>
          <EditGroupModal
            group={group}
            plans={plans}
            onClose={() => setIsEditModalOpen(false)}
            onSaved={onSaved}
          />
        </div>
      )}
    </div>
  );
}
