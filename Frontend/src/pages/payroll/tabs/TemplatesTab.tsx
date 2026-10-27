import { useEffect, useState } from 'react';
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { Table } from '../../../components/ui/Table';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useConfirm } from '../../../context/confirm-context';
import { useToast } from '../../../context/toast-context';
import { apiErrorMessage } from '../../../utils/apiError';
import { deleteTemplate, listTemplates, targetLabel, type PayrollAccess, type PayrollRules, type PayrollTemplate } from '../../../api/payroll';
import { TemplateFormModal } from '../components/TemplateFormModal';

function summary(rules: PayrollRules) {
  const on: string[] = [];
  if (rules.deductions.pf.enabled) on.push('PF');
  if (rules.deductions.esi.enabled) on.push('ESI');
  if (rules.deductions.pt.enabled) on.push('PT');
  if (rules.deductions.lwf.enabled) on.push('LWF');
  if (rules.deductions.tds.enabled) on.push('TDS');
  return on.length ? on.join(' · ') : 'No deductions';
}

export function TemplatesTab({ access }: { access: PayrollAccess }) {
  const { canManage } = access;
  const confirm = useConfirm();
  const showToast = useToast();
  const [rows, setRows] = useState<PayrollTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<PayrollTemplate | 'new' | null>(null);

  async function load() {
    setIsLoading(true);
    try {
      setRows(await listTemplates());
      setError(null);
    } catch {
      setError('Could not load salary templates.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function handleDelete(template: PayrollTemplate) {
    const ok = await confirm({
      title: 'Delete template',
      message: `Delete "${template.name}"? Months already generated with it are not affected.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteTemplate(String(template.id));
      showToast('Template deleted.', 'success');
      load();
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not delete the template.'), 'error');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">
          A template holds the salary split and every deduction rule. Editing one changes every employee on it from their next
          generated month. Templates made above your level can be used but only changed there.
        </p>
        {canManage && (
          <Button onClick={() => setOpen('new')}>
            <Plus className="mr-1.5 h-4 w-4" /> New template
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Table
        isLoading={isLoading}
        rows={rows}
        rowKey={(r) => String(r.id)}
        emptyMessage="No salary templates yet."
        columns={[
          {
            key: 'name',
            header: 'Template',
            render: (r) => (
              <div>
                <p className="font-medium text-ink">{r.name}</p>
                {r.description && <p className="text-xs text-ink-muted">{r.description}</p>}
              </div>
            ),
          },
          {
            key: 'owner',
            header: 'Made for',
            render: (r) =>
              r.targets.length === 0 ? (
                <Badge tone="neutral">Whole Group</Badge>
              ) : (
                <div className="flex max-w-xs flex-wrap gap-1">
                  {r.targets.map((t) => (
                    <Badge key={`${t.companyId}-${t.brandId ?? ''}`} tone="neutral">{targetLabel(t)}</Badge>
                  ))}
                </div>
              ),
          },
          { key: 'split', header: 'Split', render: (r) => `Basic ${r.rules.basicPercentOfGross}% · HRA ${r.rules.hraPercentOfBasic}% of Basic` },
          { key: 'ded', header: 'Deductions', render: (r) => summary(r.rules) },
          { key: 'sandwich', header: 'Sandwich', render: (r) => (r.rules.sandwichRule ? 'On' : 'Off') },
          { key: 'emp', header: 'Employees', render: (r) => r.activeEmployees },
          { key: 'status', header: 'Status', render: (r) => <Badge tone={r.isActive ? 'success' : 'neutral'}>{r.isActive ? 'Active' : 'Off'}</Badge> },
          {
            key: 'actions',
            header: '',
            className: 'w-24 text-right',
            render: (r) => (
              <div className="flex justify-end gap-1">
                <button type="button" title={r.canEdit ? 'Edit' : 'View'} className="rounded-lg p-1.5 text-ink-muted hover:bg-page hover:text-primary" onClick={() => setOpen(r)}>
                  {r.canEdit ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                {r.canEdit && (
                  <button type="button" title="Delete" className="rounded-lg p-1.5 text-ink-muted hover:bg-page hover:text-danger" onClick={() => handleDelete(r)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ),
          },
        ]}
      />

      {open && (
        <TemplateFormModal
          template={open === 'new' ? null : open}
          access={access}
          readOnly={open === 'new' ? !canManage : !open.canEdit}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            showToast('Template saved.', 'success');
            load();
          }}
        />
      )}
    </div>
  );
}
