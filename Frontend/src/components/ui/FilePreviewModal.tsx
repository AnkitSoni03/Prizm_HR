import { Download } from 'lucide-react';
import { Modal } from './Modal';
import { getFileKind } from '../../utils/fileKind';

interface FilePreviewModalProps {
  title: string;
  // Used only to infer the preview mode from its extension (image/pdf/doc) —
  // the internal GCS path works fine for this, no need for the signed URL.
  fileUrl: string | null;
  // Plain signed URL — rendered inline (<img>/<iframe> src).
  previewUrl: string | null;
  // Signed URL with a forced Content-Disposition: attachment — a real
  // Save-As regardless of origin, unlike previewUrl.
  downloadUrl: string | null;
  onClose: () => void;
}

// Opens img/pdf attachments inline in the same page instead of a new-tab
// redirect — reused by both Company Policy attachments and Employee
// Documents. Word docs (.doc/.docx) can't be rendered by the browser itself
// and are deliberately NOT sent to a third-party viewer service (e.g.
// Microsoft's Office Online) since these files can be sensitive (PAN/Aadhar
// scans, policy documents) — they just get a "download to view" fallback.
export function FilePreviewModal({ title, fileUrl, previewUrl, downloadUrl, onClose }: FilePreviewModalProps) {
  const kind = getFileKind(fileUrl);

  return (
    <Modal
      title={title}
      onClose={onClose}
      widthClassName="max-w-4xl"
      headerActions={
        downloadUrl && (
          <a
            href={downloadUrl}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-page"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
            Download
          </a>
        )
      }
    >
      <div className="flex h-[70vh] items-center justify-center overflow-auto rounded-xl border border-border bg-page">
        {!previewUrl && <p className="p-6 text-center text-sm text-ink-muted">File unavailable.</p>}
        {previewUrl && kind === 'image' && (
          <img src={previewUrl} alt={title} className="max-h-full max-w-full object-contain" />
        )}
        {previewUrl && kind === 'pdf' && (
          <iframe src={previewUrl} title={title} className="h-full w-full rounded-lg border-0" />
        )}
        {previewUrl && (kind === 'doc' || kind === 'other') && (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <p className="text-sm text-ink-muted">
              {kind === 'doc' ? "Preview isn't available for Word documents." : "Preview isn't available for this file type."}
            </p>
            <p className="text-xs text-ink-muted">Use the Download button above to view it.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
