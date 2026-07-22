import { useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Avatar } from './Avatar';

const ACCEPTED_TYPES = 'image/png,image/jpeg';

interface PhotoUploadFieldProps {
  label?: string;
  // Currently-saved (or freshly-selected, via the local object-URL preview)
  // photo to show. Null/undefined renders the generic fallback icon.
  previewUrl?: string | null;
  onSelect: (file: File) => void;
  // Omitted entirely (not just disabled) when there's nothing to remove yet.
  onRemove?: () => void;
  isBusy?: boolean;
  helperText?: string;
}

// Reused wherever an employee/own photo can be set: the Employee Add/Edit
// forms and ESS "My Profile" — always optional, file-based (not a URL field,
// unlike the older employee_documents pattern).
export function PhotoUploadField({
  label = 'Photo',
  previewUrl,
  onSelect,
  onRemove,
  isBusy = false,
  helperText = 'Optional. JPG or PNG.',
}: PhotoUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setLocalPreview(URL.createObjectURL(file));
    onSelect(file);
  }

  const displayUrl = localPreview ?? previewUrl ?? null;

  return (
    <div>
      <p className="mb-1.5 block text-sm font-medium text-ink">{label}</p>
      <div className="flex items-center gap-4">
        <Avatar src={displayUrl} size="xl" />
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-page disabled:opacity-60"
            >
              <Camera className="h-3.5 w-3.5" strokeWidth={1.75} />
              {displayUrl ? 'Change Photo' : 'Upload Photo'}
            </button>
            {displayUrl && onRemove && (
              <button
                type="button"
                onClick={() => {
                  setLocalPreview(null);
                  onRemove();
                }}
                disabled={isBusy}
                aria-label="Remove photo"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-page hover:text-danger disabled:opacity-60"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                Remove
              </button>
            )}
          </div>
          {helperText && <p className="text-xs text-ink-muted">{helperText}</p>}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
