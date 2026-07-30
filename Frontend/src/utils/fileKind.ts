export type FileKind = 'image' | 'pdf' | 'doc' | 'other';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg']);
const DOC_EXTENSIONS = new Set(['doc', 'docx']);

// Object paths/signed URLs always end in the original file's extension (see
// gcs.js::extractOriginalFileName) — cheap enough to infer preview mode from
// without ever needing a stored mimeType column.
export function getFileKind(pathOrUrl: string | null | undefined): FileKind {
  if (!pathOrUrl) return 'other';
  const withoutQuery = pathOrUrl.split('?')[0];
  const ext = withoutQuery.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (DOC_EXTENSIONS.has(ext)) return 'doc';
  return 'other';
}
