import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Modal } from './Modal';
import { PhotoEditorModal } from './PhotoEditorModal';

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
  // Replaces the plain "Photo" label above the field with custom content
  // (e.g. name + employee code) rendered above the action buttons, to the
  // right of the avatar — used by ESS "My Profile" so the photo, identity,
  // and actions read as one combined header block instead of two stacked
  // sections. Omit to keep the plain label layout every other caller uses.
  headerContent?: ReactNode;
}

// Reused wherever an employee/own photo can be set: the Employee Add/Edit
// forms and ESS "My Profile" — always optional, file-based (not a URL field,
// unlike the older employee_documents pattern). Both entry points (live
// camera capture and picking a file from disk/gallery) route through the
// same PhotoEditorModal crop/zoom step before onSelect ever fires, so
// whatever gets uploaded is already framed for a circular avatar.
export function PhotoUploadField({
  label = 'Photo',
  previewUrl,
  onSelect,
  onRemove,
  isBusy = false,
  helperText = '',
  headerContent,
}: PhotoUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [editingImageSrc, setEditingImageSrc] = useState<string | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // The <video> element only mounts once isCameraOpen is true, so the stream
  // has to be attached after that render — same pattern as
  // RegisterFaceCard.tsx (videoRef.current is still null before then).
  useEffect(() => {
    if (isCameraOpen && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [isCameraOpen]);

  async function handleOpenCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      setIsCameraOpen(true);
    } catch {
      setCameraError('Could not access your camera. Please allow camera access and try again.');
    }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsCameraOpen(false);
  }

  function handleCapture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    closeCamera();
    setEditingImageSrc(canvas.toDataURL('image/jpeg', 0.95));
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setEditingImageSrc(URL.createObjectURL(file));
  }

  function handleEditorSave(file: File) {
    setLocalPreview(URL.createObjectURL(file));
    setEditingImageSrc(null);
    onSelect(file);
  }

  const displayUrl = localPreview ?? previewUrl ?? null;

  return (
    <div>
      {!headerContent && <p className="mb-1.5 block text-xs font-medium text-ink sm:text-sm">{label}</p>}
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        {displayUrl ? (
          <button
            type="button"
            onClick={() => setIsViewerOpen(true)}
            aria-label="View photo"
            className="shrink-0 rounded-full transition-opacity hover:opacity-80"
          >
            <Avatar src={displayUrl} size="xl" />
          </button>
        ) : (
          <Avatar src={displayUrl} size="xl" className="shrink-0" />
        )}
        <div className="flex min-w-0 flex-col gap-1.5 sm:gap-2">
          {headerContent}
          {cameraError && <p className="text-[10px] text-danger sm:text-xs">{cameraError}</p>}
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={handleOpenCamera}
              disabled={isBusy}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-ink transition-colors hover:bg-page disabled:opacity-60 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm"
            >
              <Camera className="h-3 w-3 sm:h-3.5 sm:w-3.5" strokeWidth={1.75} />
              Take Photo
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isBusy}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-ink transition-colors hover:bg-page disabled:opacity-60 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm"
            >
              <ImagePlus className="h-3 w-3 sm:h-3.5 sm:w-3.5" strokeWidth={1.75} />
              Choose from Gallery
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
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:bg-page hover:text-danger disabled:opacity-60 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm"
              >
                <X className="h-3 w-3 sm:h-3.5 sm:w-3.5" strokeWidth={1.75} />
                Remove
              </button>
            )}
          </div>
          {helperText && <p className="text-[10px] text-ink-muted sm:text-xs">{helperText}</p>}
        </div>
        <input ref={inputRef} type="file" accept={ACCEPTED_TYPES} className="hidden" onChange={handleFileChange} />
      </div>

      {isCameraOpen && (
        <Modal title="Take Photo" onClose={closeCamera} widthClassName="max-w-sm">
          <div className="space-y-4">
            <video ref={videoRef} muted playsInline className="w-full rounded-lg bg-black" />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={closeCamera}>
                Cancel
              </Button>
              <Button type="button" onClick={handleCapture}>
                Capture
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {editingImageSrc && (
        <PhotoEditorModal
          imageSrc={editingImageSrc}
          onCancel={() => setEditingImageSrc(null)}
          onSave={handleEditorSave}
        />
      )}

      {isViewerOpen && displayUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] transition-colors duration-150 animate-[fade-in_150ms_ease-out]"
          onClick={() => setIsViewerOpen(false)}
        >
          <img
            src={displayUrl}
            alt={label}
            className="h-[70vmin] w-[70vmin] max-h-[80vh] max-w-[80vw] rounded-full object-cover shadow-lg animate-[modal-in_180ms_cubic-bezier(0.16,1,0.3,1)]"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
