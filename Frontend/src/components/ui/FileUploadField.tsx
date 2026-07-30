import { useRef } from 'react';
import { Paperclip, X } from 'lucide-react';

const DEFAULT_ACCEPT = '.pdf,.doc,.docx,image/png,image/jpeg';

interface FileUploadFieldProps {
  label?: string;
  file: File | null;
  onSelect: (file: File | null) => void;
  accept?: string;
  helperText?: string;
  disabled?: boolean;
}

// Generic single-file picker (PDF/Word/PNG/JPEG — same allowlist as
// upload.middleware.js) for attachments that aren't a profile photo, e.g.
// employee documents. Deliberately not an <input required> — callers
// validate `file !== null` themselves before submitting, same as
// PhotoUploadField's onSelect callback pattern.
export function FileUploadField({
  label = 'File',
  file,
  onSelect,
  accept = DEFAULT_ACCEPT,
  helperText = 'PDF, Word, PNG, or JPEG. Max 10MB.',
  disabled = false,
}: FileUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (selected) onSelect(selected);
  }

  return (
    <div>
      <p className="mb-1.5 block text-sm font-medium text-ink">{label}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-page disabled:opacity-60"
        >
          <Paperclip className="h-3.5 w-3.5" strokeWidth={1.75} />
          {file ? 'Change File' : 'Choose File'}
        </button>
        {file && (
          <>
            <span className="max-w-[12rem] truncate text-sm text-ink-muted">{file.name}</span>
            <button
              type="button"
              onClick={() => onSelect(null)}
              disabled={disabled}
              aria-label="Remove selected file"
              className="rounded-md p-1 text-ink-muted transition-colors hover:bg-page hover:text-danger disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </>
        )}
        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleChange} />
      </div>
      {helperText && <p className="mt-1 text-xs text-ink-muted">{helperText}</p>}
    </div>
  );
}
