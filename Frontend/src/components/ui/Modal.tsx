import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  widthClassName?: string;
}

export function Modal({ title, onClose, children, widthClassName = 'max-w-md' }: ModalProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] transition-colors duration-150 md:px-4 dark:bg-black/60 animate-[fade-in_150ms_ease-out]"
      onClick={onClose}
    >
      <div
        className={[
          'flex w-full flex-col overflow-y-auto border-border bg-card shadow-lg transition-all duration-150',
          'max-md:h-full max-md:max-w-none max-md:rounded-none max-md:border-0 max-md:p-5',
          'md:max-h-[90vh] md:rounded-xl md:border md:p-6',
          'animate-[modal-in_180ms_cubic-bezier(0.16,1,0.3,1)]',
          widthClassName,
        ].join(' ')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex shrink-0 items-center justify-between">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-ink-muted transition-colors hover:bg-page hover:text-ink"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
