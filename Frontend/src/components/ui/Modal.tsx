import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  widthClassName?: string;
  // Rendered directly under the title, pinned together with it (see the
  // sticky wrapper below) — for a Tabs bar so switching tabs (e.g. the
  // "Powers" tab in EmployeeDetailModal) stays reachable without hunting for
  // it after scrolling down into a tab's content.
  tabs?: ReactNode;
  // Rendered in the title row itself, to the left of the close (X) button —
  // e.g. a Download button on FilePreviewModal.
  headerActions?: ReactNode;
  // Keeps the modal a small, centered card with a blurred backdrop even on
  // mobile, instead of the default max-md full-screen takeover — for short
  // warning/notification-style content (a reminder, a confirmation) where a
  // full-screen sheet would feel oversized. Every content-heavy modal (forms,
  // detail views) omits this and keeps the normal full-screen mobile layout.
  compact?: boolean;
}

export function Modal({
  title,
  onClose,
  children,
  widthClassName = 'max-w-md',
  tabs,
  headerActions,
  compact = false,
}: ModalProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className={[
        'fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] transition-colors duration-150 dark:bg-black/60 animate-[fade-in_150ms_ease-out]',
        compact ? 'px-4' : 'md:px-4',
      ].join(' ')}
      onClick={onClose}
    >
      <div
        className={[
          'flex w-full flex-col overflow-y-auto border-border bg-card shadow-lg transition-all duration-150',
          compact
            ? 'max-h-[85vh] rounded-xl border p-5'
            : [
                'max-md:h-full max-md:max-w-none max-md:rounded-none max-md:border-0 max-md:p-5',
                'md:max-h-[90vh] md:rounded-xl md:border md:p-6',
              ].join(' '),
          'animate-[modal-in_180ms_cubic-bezier(0.16,1,0.3,1)]',
          widthClassName,
        ].join(' ')}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={[
            'sticky top-0 z-10 shrink-0 bg-card',
            compact ? '-mx-5 px-5' : '-mx-6 px-6 max-md:-mx-5 max-md:px-5',
          ].join(' ')}
        >
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{title}</h2>
            <div className="flex shrink-0 items-center gap-2">
              {headerActions}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-md p-1 text-ink-muted transition-colors hover:bg-page hover:text-ink"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          </div>
          {tabs}
        </div>
        {children}
      </div>
    </div>
  );
}
