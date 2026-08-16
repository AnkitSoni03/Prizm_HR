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
  // Smaller label/button/helper text for tight spots (e.g. an inline upload
  // row) — every other caller omits this and keeps the normal size untouched.
  compact?: boolean;
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
  compact = false,
}: FileUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (selected) onSelect(selected);
  }

  return (
    <div>
      <p className={`mb-1.5 block font-medium text-ink ${compact ? 'text-xs' : 'text-sm'}`}>{label}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className={[
            'inline-flex items-center whitespace-nowrap rounded-lg border border-border font-medium text-ink transition-colors hover:bg-page disabled:opacity-60',
            compact ? 'gap-1 px-2 py-1 text-xs' : 'gap-1.5 px-3 py-1.5 text-sm',
          ].join(' ')}
        >
          <Paperclip className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} strokeWidth={1.75} />
          {file ? 'Change File' : 'Choose File'}
        </button>
        {file && (
          <>
            <span className={`max-w-[12rem] truncate text-ink-muted ${compact ? 'text-xs' : 'text-sm'}`}>
              {file.name}
            </span>
            <button
              type="button"
              onClick={() => onSelect(null)}
              disabled={disabled}
              aria-label="Remove selected file"
              className="rounded-md p-1 text-ink-muted transition-colors hover:bg-page hover:text-danger disabled:opacity-60"
            >
              <X className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} strokeWidth={1.75} />
            </button>
          </>
        )}
        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleChange} />
      </div>
      {helperText && <p className={`mt-1 text-ink-muted ${compact ? 'text-[10px]' : 'text-xs'}`}>{helperText}</p>}
    </div>
  );
}
