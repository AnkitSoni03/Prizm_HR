import { useEffect, useState, type FormEvent } from 'react';
import { FileText, Paperclip } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { RosterMultiSelect } from '../../../components/ui/RosterMultiSelect';
import { useToast } from '../../../context/toast-context';
import {
  createCompanyPolicy,
  updateCompanyPolicy,
  uploadPolicyAttachment,
  type CompanyPolicy,
} from '../../../api/companyAdmin/companyPolicies';
import { listRosterGroups, type RosterPolicyGroup } from '../../../api/companyAdmin/rosterGroups';
import { FilePreviewModal } from '../../../components/ui/FilePreviewModal';

interface PolicyFormModalProps {
  policy?: CompanyPolicy;
  onClose: () => void;
  onSaved: () => void;
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function PolicyFormModal({ policy, onClose, onSaved }: PolicyFormModalProps) {
  const isEdit = !!policy;
  const showToast = useToast();
  const [title, setTitle] = useState(policy?.title ?? '');
  const [body, setBody] = useState(policy?.body ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [rosterGroups, setRosterGroups] = useState<RosterPolicyGroup[]>([]);
  const [rosterGroupIds, setRosterGroupIds] = useState<string[]>(
    policy?.rosterGroups?.map((rg) => rg.id) ?? []
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    listRosterGroups()
      .then(setRosterGroups)
      .catch(() => setRosterGroups([]));
  }, []);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE_BYTES) {
      setError('File is too large (max 10MB).');
      event.target.value = '';
      setFile(null);
      return;
    }
    setError(null);
    setFile(selected);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const saved = isEdit
        ? await updateCompanyPolicy(policy.id, { title, body, rosterGroupIds })
        : await createCompanyPolicy({ title, body, rosterGroupIds });

      // Uploading the attachment is a separate, non-blocking step — the
      // policy itself already exists at this point either way.
      if (file) {
        try {
          await uploadPolicyAttachment(saved.id, file);
        } catch {
          showToast(
            `"${title}" was saved, but the attachment could not be uploaded. You can try again from the edit form.`
          );
        }
      }

      onSaved();
      onClose();
    } catch {
      setError(`Could not ${isEdit ? 'update' : 'create'} this policy. Please try again.`);
      setIsSubmitting(false);
    }
  }

  return (
    <>
    <Modal title={isEdit ? 'Edit Policy' : 'Add Company Policy'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <Input
          id="policy-title"
          label="Title"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Work From Home Policy"
        />
        <div>
          <label htmlFor="policy-body" className="mb-1.5 block text-sm font-medium text-ink">
            Description
          </label>
          <textarea
            id="policy-body"
            rows={6}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Describe the policy…"
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-base text-ink placeholder:text-ink-muted transition-all duration-150 hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm"
          />
        </div>
        <RosterMultiSelect rosterGroups={rosterGroups} selectedIds={rosterGroupIds} onChange={setRosterGroupIds} />
        <div>
          <label htmlFor="policy-file" className="mb-1.5 block text-sm font-medium text-ink">
            Attachment (optional)
          </label>
          {isEdit && policy.fileUrl && !file && (
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-page px-3 py-2 text-sm text-ink-muted">
              <FileText className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              {policy.fileDownloadUrl ? (
                <button type="button" onClick={() => setShowPreview(true)} className="text-primary hover:underline">
                  Current attachment
                </button>
              ) : (
                <span>Current attachment</span>
              )}
              <span className="text-xs">— choose a new file below to replace it</span>
            </div>
          )}
          <label
            htmlFor="policy-file"
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-ink-muted hover:border-primary/40 hover:bg-page"
          >
            <Paperclip className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            {file ? file.name : 'Choose a PDF, Word doc, or image…'}
          </label>
          <input
            id="policy-file"
            type="file"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {isEdit ? 'Save Changes' : 'Add Policy'}
          </Button>
        </div>
      </form>
    </Modal>
    {showPreview && policy?.fileDownloadUrl && (
      <FilePreviewModal
        title={policy.title}
        fileUrl={policy.fileUrl}
        previewUrl={policy.fileDownloadUrl}
        downloadUrl={policy.fileAttachmentUrl}
        onClose={() => setShowPreview(false)}
      />
    )}
    </>
  );
}
