import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { ToastType } from '../../context/toast-context';

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

const TYPE_CONFIG: Record<ToastType, { icon: typeof CheckCircle2; classes: string }> = {
  success: { icon: CheckCircle2, classes: 'border-success/20 text-success' },
  error: { icon: XCircle, classes: 'border-danger/20 text-danger' },
  info: { icon: Info, classes: 'border-primary/20 text-primary' },
};

export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex w-full max-w-sm flex-col gap-2.5">
      {toasts.map((toast) => {
        const { icon: Icon, classes } = TYPE_CONFIG[toast.type];
        return (
          <div
            key={toast.id}
            role="status"
            className={[
              'flex items-start gap-3 rounded-xl border bg-card p-3.5 shadow-lg',
              'animate-[modal-in_180ms_cubic-bezier(0.16,1,0.3,1)]',
              classes,
            ].join(' ')}
          >
            <Icon className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.75} />
            <p className="flex-1 text-sm leading-relaxed text-ink">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss"
              className="rounded-md p-0.5 text-ink-muted transition-colors hover:bg-page hover:text-ink"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
