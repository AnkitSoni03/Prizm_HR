import { AlertTriangle, HelpCircle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import type { ConfirmOptions } from '../../context/confirm-context';

interface ConfirmDialogProps extends ConfirmOptions {
  onConfirm: () => void;
  onCancel: () => void;
}

const VARIANT_ICON_CLASSES: Record<NonNullable<ConfirmOptions['variant']>, string> = {
  danger: 'bg-danger/10 text-danger',
  primary: 'bg-primary/10 text-primary',
};

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const Icon = variant === 'danger' ? AlertTriangle : HelpCircle;

  return (
    <Modal title={title} onClose={onCancel} widthClassName="max-w-sm">
      <div className="flex gap-3.5">
        <div
          className={[
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            VARIANT_ICON_CLASSES[variant],
          ].join(' ')}
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <p className="pt-1.5 text-sm leading-relaxed text-ink-muted">{message}</p>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={variant === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
