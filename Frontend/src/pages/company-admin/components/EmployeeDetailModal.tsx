import { useEffect, useState, type FormEvent } from 'react';
import axios from 'axios';
import { Check, CheckCircle2, Copy, FileText } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Tabs } from '../../../components/ui/Tabs';
import { useAuth } from '../../../context/auth-context';
import { useToast } from '../../../context/toast-context';
import {
  assignEmployeePowers,
  getEmployee,
  updateEmployee,
  transferEmployee,
  inviteEmployeeUser,
  uploadEmployeePhoto,
  removeEmployeePhoto,
} from '../../../api/companyAdmin/employees';
import { PhotoUploadField } from '../../../components/ui/PhotoUploadField';
import { Avatar } from '../../../components/ui/Avatar';
import {
  listEmployeeDocuments,
  uploadEmployeeDocument,
  verifyEmployeeDocument,
  type EmployeeDocument,
} from '../../../api/companyAdmin/employeeDocuments';
import {
  adjustLeaveBalance,
  listLeaveBalances,
  listLeaveTypes,
  type LeaveBalance,
  type LeaveType,
} from '../../../api/companyAdmin/leaveBalance';
import { listPowers } from '../../../api/powers';
import { PowerAssignment } from '../../../components/PowerAssignment';
import type { Brand, Department, Designation, Employee } from '../../../api/tenancy';
import { INDIAN_STATES } from '../../../utils/indianStates';

interface EmployeeDetailModalProps {
  employee: Employee;
  brands: Brand[];
  departments: Department[];
  designations: Designation[];
  employees: Employee[];
  onClose: () => void;
  onUpdated: () => void;
  // Separate from onUpdated (which also closes this modal, e.g. after
  // saving Details/Transfer) — a photo change should refresh the parent's
  // list (so its avatar picks up the new photo) without closing this modal.
  onPhotoChanged?: () => void;
}

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
];

const STATUS_OPTIONS = [
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'active', label: 'Active' },
  { value: 'on_notice', label: 'On Notice' },
  { value: 'exited', label: 'Exited' },
  { value: 'archived', label: 'Archived' },
];

function statusTone(status: Employee['status']) {
  if (status === 'active') return 'success';
  if (status === 'onboarding' || status === 'on_notice') return 'warning';
  return 'neutral';
}

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
    return err.response.data.error;
  }
  return fallback;
}

export function EmployeeDetailModal({
  employee,
  brands,
  departments,
  designations,
  employees,
  onClose,
  onUpdated,
  onPhotoChanged,
}: EmployeeDetailModalProps) {
  const { user, hasPermission } = useAuth();
  const showToast = useToast();
  const usesBrands = user?.companyUsesBrands ?? true;
  const canUpdate = hasPermission('employee:update');
  const canTransfer = hasPermission('employee:transfer');
  const canReadDocs = hasPermission('employee_document:read');
  const canUploadDocs = hasPermission('employee_document:upload');
  const canVerifyDocs = hasPermission('employee_document:verify');
  const canInviteEss = hasPermission('user:invite');
  const canReadLeaveBalance = hasPermission('leave_balance:read');
  const canAdjustLeaveBalance = hasPermission('leave_balance:adjust');

  const [activeTab, setActiveTab] = useState<'details' | 'documents' | 'leaveBalance' | 'powers'>('details');

  const [photoDownloadUrl, setPhotoDownloadUrl] = useState(employee.photoDownloadUrl ?? null);
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);

  const [designationId, setDesignationId] = useState(employee.designationId ?? '');
  const [managerId, setManagerId] = useState(employee.managerId ?? '');
  const [dateOfJoining, setDateOfJoining] = useState(employee.dateOfJoining ?? '');
  const [employmentType, setEmploymentType] = useState(employee.employmentType);
  const [status, setStatus] = useState(employee.status);
  const [workState, setWorkState] = useState(employee.workState ?? '');
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [transferBrandId, setTransferBrandId] = useState(employee.brandId ?? '');
  const [transferDepartmentId, setTransferDepartmentId] = useState(employee.departmentId);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const [essEmail, setEssEmail] = useState('');
  const [isInvitingEss, setIsInvitingEss] = useState(false);
  const [essInviteError, setEssInviteError] = useState<string | null>(null);
  const [essActivationToken, setEssActivationToken] = useState<string | null>(null);
  const [isEssLinkCopied, setIsEssLinkCopied] = useState(false);

  const essActivationUrl = essActivationToken
    ? `${window.location.origin}/activate?token=${encodeURIComponent(essActivationToken)}`
    : null;

  const [documents, setDocuments] = useState<EmployeeDocument[] | null>(null);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [docType, setDocType] = useState('');
  const [docFileUrl, setDocFileUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (activeTab !== 'documents' || documents !== null || !canReadDocs) return;
    listEmployeeDocuments(employee.id)
      .then(setDocuments)
      .catch(() => setDocsError('Could not load documents.'));
  }, [activeTab, documents, canReadDocs, employee.id]);

  const [leaveBalanceYear, setLeaveBalanceYear] = useState(new Date().getFullYear());
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [isLoadingLeaveBalances, setIsLoadingLeaveBalances] = useState(false);
  const [leaveBalanceError, setLeaveBalanceError] = useState<string | null>(null);
  const [draftAllotted, setDraftAllotted] = useState<Record<string, string>>({});
  const [savingLeaveTypeId, setSavingLeaveTypeId] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== 'leaveBalance' || !canReadLeaveBalance) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoadingLeaveBalances(true);
    setLeaveBalanceError(null);
    Promise.all([listLeaveTypes(), listLeaveBalances({ employeeId: employee.id, year: leaveBalanceYear })])
      .then(([types, balances]) => {
        setLeaveTypes(types);
        setLeaveBalances(balances);
        setDraftAllotted(
          Object.fromEntries(
            types.map((type) => {
              const existing = balances.find((balance) => balance.leaveTypeId === type.id);
              return [type.id, existing ? String(existing.allotted) : ''];
            })
          )
        );
      })
      .catch(() => setLeaveBalanceError('Could not load leave balances.'))
      .finally(() => setIsLoadingLeaveBalances(false));
  }, [activeTab, canReadLeaveBalance, employee.id, leaveBalanceYear]);

  const [powerKeys, setPowerKeys] = useState<string[]>([]);
  const [isSavingPowers, setIsSavingPowers] = useState(false);
  const [powersError, setPowersError] = useState<string | null>(null);
  const [powersSuccess, setPowersSuccess] = useState(false);

  useEffect(() => {
    if (activeTab !== 'powers' || !canUpdate) return;
    // The `employee` prop comes from the list view (no customRole
    // eager-load) — fetch the full record here instead, which does
    // eager-load customRole + its permissions (see
    // employee.service.js::getEmployeeForRead), so the checkboxes pre-check
    // whichever catalog keys are already granted.
    Promise.all([listPowers(), getEmployee(employee.id)])
      .then(([catalog, freshEmployee]) => {
        const grantedCodes = new Set((freshEmployee.customRole?.permissions ?? []).map((p) => p.code));
        setPowerKeys(
          catalog
            .filter((power) => power.permissionCodes.every((code) => grantedCodes.has(code)))
            .map((power) => power.key)
        );
      })
      .catch(() => setPowersError('Could not load current powers.'));
  }, [activeTab, canUpdate, employee.id]);

  // Doesn't call onUpdated() — same reasoning as the ESS-invite section
  // below (that also closes the modal), so the success message stays
  // visible instead of vanishing immediately.
  async function handleSavePowers() {
    setPowersError(null);
    setPowersSuccess(false);
    setIsSavingPowers(true);
    try {
      await assignEmployeePowers(employee.id, powerKeys);
      setPowersSuccess(true);
    } catch (err) {
      setPowersError(extractError(err, 'Could not save powers. Please try again.'));
    } finally {
      setIsSavingPowers(false);
    }
  }

  async function handleAdjustLeaveBalance(event: FormEvent, leaveTypeId: string) {
    event.preventDefault();
    const raw = draftAllotted[leaveTypeId];
    const allotted = Number(raw);
    if (raw === undefined || raw === '' || Number.isNaN(allotted) || allotted < 0) return;
    setLeaveBalanceError(null);
    setSavingLeaveTypeId(leaveTypeId);
    try {
      const updated = await adjustLeaveBalance({
        employeeId: employee.id,
        leaveTypeId,
        year: leaveBalanceYear,
        allotted,
      });
      setLeaveBalances((prev) => [...prev.filter((balance) => balance.leaveTypeId !== leaveTypeId), updated]);
    } catch (err) {
      setLeaveBalanceError(extractError(err, 'Could not update this leave balance.'));
    } finally {
      setSavingLeaveTypeId(null);
    }
  }

  async function handlePhotoSelect(file: File) {
    setIsSavingPhoto(true);
    try {
      const updated = await uploadEmployeePhoto(employee.id, file);
      setPhotoDownloadUrl(updated.photoDownloadUrl ?? null);
      onPhotoChanged?.();
    } catch {
      showToast('Could not upload the photo. Please try again.');
    } finally {
      setIsSavingPhoto(false);
    }
  }

  async function handlePhotoRemove() {
    setIsSavingPhoto(true);
    try {
      const updated = await removeEmployeePhoto(employee.id);
      setPhotoDownloadUrl(updated.photoDownloadUrl ?? null);
      onPhotoChanged?.();
    } catch {
      showToast('Could not remove the photo. Please try again.');
    } finally {
      setIsSavingPhoto(false);
    }
  }

  async function handleSaveDetails(event: FormEvent) {
    event.preventDefault();
    setDetailsError(null);
    setIsSavingDetails(true);
    try {
      await updateEmployee(employee.id, {
        designationId: designationId || null,
        employmentType,
        status,
        dateOfJoining: dateOfJoining || null,
        managerId: managerId || null,
        workState: workState || null,
      });
      onUpdated();
    } catch (err) {
      setDetailsError(extractError(err, 'Could not save changes. Please try again.'));
    } finally {
      setIsSavingDetails(false);
    }
  }

  async function handleTransfer(event: FormEvent) {
    event.preventDefault();
    setTransferError(null);
    setIsTransferring(true);
    try {
      await transferEmployee(employee.id, {
        brandId: usesBrands && transferBrandId !== (employee.brandId ?? '') ? transferBrandId : undefined,
        departmentId: transferDepartmentId !== employee.departmentId ? transferDepartmentId : undefined,
      });
      onUpdated();
    } catch (err) {
      setTransferError(extractError(err, 'Could not transfer this employee. Please try again.'));
    } finally {
      setIsTransferring(false);
    }
  }

  async function handleCopyEssActivationUrl() {
    if (!essActivationUrl) return;
    await navigator.clipboard.writeText(essActivationUrl);
    setIsEssLinkCopied(true);
    setTimeout(() => setIsEssLinkCopied(false), 2000);
  }

  // Doesn't call onUpdated() — that also closes the modal (see EmployeesPage),
  // which would hide the activation link right after it's produced. The
  // employee list picks up the new userId next time it's reloaded.
  async function handleInviteEss(event: FormEvent) {
    event.preventDefault();
    setEssInviteError(null);
    setIsInvitingEss(true);
    try {
      const result = await inviteEmployeeUser(employee.id, essEmail);
      setEssActivationToken(result.activationToken ?? null);
    } catch (err) {
      setEssInviteError(extractError(err, 'Could not send the invite. Please try again.'));
    } finally {
      setIsInvitingEss(false);
    }
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    setDocsError(null);
    setIsUploading(true);
    try {
      const doc = await uploadEmployeeDocument(employee.id, { type: docType, fileUrl: docFileUrl });
      setDocuments((prev) => (prev ? [...prev, doc] : [doc]));
      setDocType('');
      setDocFileUrl('');
    } catch (err) {
      setDocsError(extractError(err, 'Could not upload this document. Please try again.'));
    } finally {
      setIsUploading(false);
    }
  }

  async function handleVerify(doc: EmployeeDocument) {
    try {
      const updated = await verifyEmployeeDocument(employee.id, doc.id);
      setDocuments((prev) => (prev ? prev.map((d) => (d.id === updated.id ? updated : d)) : prev));
    } catch {
      showToast('Could not verify this document.');
    }
  }

  return (
    <Modal
      title={employee.name ?? employee.employeeCode}
      onClose={onClose}
      widthClassName="max-w-2xl"
      tabs={
        <Tabs
          items={[
            { key: 'details', label: 'Details' },
            { key: 'documents', label: 'Documents' },
            { key: 'leaveBalance', label: 'Leave Balance' },
            { key: 'powers', label: 'Powers' },
          ]}
          active={activeTab}
          onChange={(key) => setActiveTab(key as 'details' | 'documents' | 'leaveBalance' | 'powers')}
        />
      }
    >
      {activeTab === 'details' && (
        <div className="space-y-6">
          {canUpdate ? (
            <PhotoUploadField
              previewUrl={photoDownloadUrl}
              onSelect={handlePhotoSelect}
              onRemove={photoDownloadUrl ? handlePhotoRemove : undefined}
              isBusy={isSavingPhoto}
            />
          ) : (
            <div className="flex items-center gap-4">
              <Avatar src={photoDownloadUrl} size="xl" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl border border-border bg-page px-4 py-3 text-sm">
            <p className="text-ink-muted">Employee Code</p>
            <p className="text-ink">{employee.employeeCode}</p>
            {usesBrands && (
              <>
                <p className="text-ink-muted">Brand</p>
                <p className="text-ink">{brands.find((b) => b.id === employee.brandId)?.name ?? '—'}</p>
              </>
            )}
            <p className="text-ink-muted">Department</p>
            <p className="text-ink">
              {departments.find((d) => d.id === employee.departmentId)?.name ?? '—'}
            </p>
            <p className="text-ink-muted">Status</p>
            <p>
              <Badge tone={statusTone(employee.status)}>{employee.status}</Badge>
            </p>
          </div>

          <form onSubmit={handleSaveDetails} className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Edit Details</p>
            {detailsError && <p className="text-sm text-danger">{detailsError}</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                id="employee-designation-edit"
                label="Designation"
                value={designationId}
                onChange={(event) => setDesignationId(event.target.value)}
                disabled={!canUpdate}
                placeholder="No designation"
                options={designations.map((d) => ({ value: d.id, label: d.title }))}
              />
              <Select
                id="employee-manager-edit"
                label="Manager"
                value={managerId}
                onChange={(event) => setManagerId(event.target.value)}
                disabled={!canUpdate}
                placeholder="No manager"
                options={employees
                  .filter((e) => e.id !== employee.id)
                  .map((e) => ({ value: e.id, label: `${e.name} (${e.employeeCode})` }))}
              />
              <Input
                id="employee-doj-edit"
                label="Date of Joining"
                type="date"
                value={dateOfJoining}
                onChange={(event) => setDateOfJoining(event.target.value)}
                disabled={!canUpdate}
              />
              <Select
                id="employee-type-edit"
                label="Employment Type"
                value={employmentType}
                onChange={(event) =>
                  setEmploymentType(event.target.value as 'full_time' | 'part_time' | 'contract')
                }
                disabled={!canUpdate}
                options={EMPLOYMENT_TYPES}
              />
              <Select
                id="employee-status-edit"
                label="Status"
                value={status}
                onChange={(event) => setStatus(event.target.value as Employee['status'])}
                disabled={!canUpdate}
                options={STATUS_OPTIONS}
              />
              <Select
                id="employee-work-state-edit"
                label="Work State"
                value={workState}
                onChange={(event) => setWorkState(event.target.value)}
                disabled={!canUpdate}
                placeholder="Not set"
                options={INDIAN_STATES.map((state) => ({ value: state, label: state }))}
              />
            </div>
            {canUpdate && (
              <div className="flex justify-end">
                <Button type="submit" isLoading={isSavingDetails}>
                  Save Changes
                </Button>
              </div>
            )}
          </form>

          {canTransfer && (
            <form onSubmit={handleTransfer} className="space-y-4 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {usesBrands ? 'Transfer Brand / Department' : 'Transfer Department'}
              </p>
              {transferError && <p className="text-sm text-danger">{transferError}</p>}
              <div className={usesBrands ? 'grid grid-cols-1 gap-4 sm:grid-cols-2' : ''}>
                {usesBrands && (
                  <Select
                    id="employee-transfer-brand"
                    label="Brand"
                    value={transferBrandId}
                    onChange={(event) => setTransferBrandId(event.target.value)}
                    options={brands.map((b) => ({ value: b.id, label: b.name }))}
                  />
                )}
                <Select
                  id="employee-transfer-department"
                  label="Department"
                  value={transferDepartmentId}
                  onChange={(event) => setTransferDepartmentId(event.target.value)}
                  options={departments.map((d) => ({ value: d.id, label: d.name }))}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="secondary"
                  isLoading={isTransferring}
                  disabled={
                    (!usesBrands || transferBrandId === (employee.brandId ?? '')) &&
                    transferDepartmentId === employee.departmentId
                  }
                >
                  Transfer
                </Button>
              </div>
            </form>
          )}

          {canInviteEss && (
            <div className="space-y-4 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Employee Self-Service Access
              </p>

              {employee.userId && !essActivationToken && (
                <p className="text-sm text-ink-muted">This employee already has a linked login account.</p>
              )}

              {!employee.userId && !essActivationToken && (
                <form onSubmit={handleInviteEss} className="space-y-4">
                  <p className="text-sm text-ink-muted">
                    Invite this employee to log in to the ESS portal and manage their own attendance, leave,
                    and profile.
                  </p>
                  {essInviteError && <p className="text-sm text-danger">{essInviteError}</p>}
                  <Input
                    id="employee-ess-email"
                    label="Email"
                    type="email"
                    required
                    value={essEmail}
                    onChange={(event) => setEssEmail(event.target.value)}
                    placeholder="employee@company.com"
                  />
                  <div className="flex justify-end">
                    <Button type="submit" variant="secondary" isLoading={isInvitingEss}>
                      Invite as ESS user
                    </Button>
                  </div>
                </form>
              )}

              {essActivationToken && (
                <div className="space-y-3">
                  <p className="text-sm text-ink-muted">
                    An invitation was created for <span className="font-medium">{essEmail}</span>.
                  </p>
                  {essActivationUrl && (
                    <div className="w-full rounded-xl border border-border bg-page p-3 text-left">
                      <p className="mb-1 text-xs font-medium text-ink-muted">
                        Activation link (dev only — no email provider configured yet):
                      </p>
                      <div className="flex items-center gap-2">
                        <a
                          href={essActivationUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block flex-1 break-all text-xs text-primary hover:underline"
                        >
                          {essActivationUrl}
                        </a>
                        <button
                          type="button"
                          onClick={handleCopyEssActivationUrl}
                          aria-label="Copy activation link"
                          className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-card hover:text-ink"
                        >
                          {isEssLinkCopied ? (
                            <Check className="h-3.5 w-3.5 text-success" strokeWidth={1.75} />
                          ) : (
                            <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="space-y-4">
          {!canReadDocs && <p className="text-sm text-ink-muted">You don&apos;t have access to documents.</p>}
          {canReadDocs && (
            <>
              {docsError && <p className="text-sm text-danger">{docsError}</p>}
              {documents === null && <p className="text-sm text-ink-muted">Loading…</p>}
              {documents?.length === 0 && <p className="text-sm text-ink-muted">No documents uploaded yet.</p>}
              {documents && documents.length > 0 && (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between rounded-xl border border-border px-4 py-2.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <FileText className="h-4 w-4 text-ink-muted" strokeWidth={1.75} />
                        <div>
                          <p className="text-sm font-medium text-ink">{doc.type}</p>
                          <a
                            href={doc.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            View file
                          </a>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={doc.verified ? 'success' : 'warning'}>
                          {doc.verified ? 'Verified' : 'Unverified'}
                        </Badge>
                        {canVerifyDocs && !doc.verified && (
                          <button
                            type="button"
                            onClick={() => handleVerify(doc)}
                            aria-label={`Verify ${doc.type}`}
                            className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-success"
                          >
                            <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {canUploadDocs && (
                <form onSubmit={handleUpload} className="space-y-4 border-t border-border pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Add Document</p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input
                      id="doc-type"
                      label="Type"
                      required
                      value={docType}
                      onChange={(event) => setDocType(event.target.value)}
                      placeholder="e.g. PAN Card"
                    />
                    <Input
                      id="doc-file-url"
                      label="File URL"
                      required
                      value={docFileUrl}
                      onChange={(event) => setDocFileUrl(event.target.value)}
                      placeholder="https://…"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" variant="secondary" isLoading={isUploading}>
                      Add Document
                    </Button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'leaveBalance' && (
        <div className="space-y-4">
          {!canReadLeaveBalance && (
            <p className="text-sm text-ink-muted">You don&apos;t have access to leave balances.</p>
          )}
          {canReadLeaveBalance && (
            <>
              <div className="w-32">
                <Select
                  id="leave-balance-year"
                  label="Year"
                  value={String(leaveBalanceYear)}
                  onChange={(event) => setLeaveBalanceYear(Number(event.target.value))}
                  options={[leaveBalanceYear - 1, leaveBalanceYear, leaveBalanceYear + 1].map((y) => ({
                    value: String(y),
                    label: String(y),
                  }))}
                />
              </div>
              {leaveBalanceError && <p className="text-sm text-danger">{leaveBalanceError}</p>}
              {isLoadingLeaveBalances && <p className="text-sm text-ink-muted">Loading…</p>}
              {!isLoadingLeaveBalances && leaveTypes.length === 0 && (
                <p className="text-sm text-ink-muted">No leave types set up for this company yet.</p>
              )}
              {!isLoadingLeaveBalances && leaveTypes.length > 0 && (
                <div className="space-y-2">
                  {leaveTypes.map((type) => {
                    const balance = leaveBalances.find((b) => b.leaveTypeId === type.id);
                    return (
                      <div
                        key={type.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-2.5"
                      >
                        <div>
                          <p className="text-sm font-medium text-ink">{type.name}</p>
                          <p className="text-xs text-ink-muted">
                            {balance
                              ? `${balance.allotted} total · ${balance.used} used · ${balance.balance} remaining`
                              : 'Not yet assigned'}
                          </p>
                        </div>
                        {canAdjustLeaveBalance && (
                          <form
                            onSubmit={(event) => handleAdjustLeaveBalance(event, type.id)}
                            className="flex items-center gap-2"
                          >
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={draftAllotted[type.id] ?? ''}
                              onChange={(event) =>
                                setDraftAllotted((prev) => ({ ...prev, [type.id]: event.target.value }))
                              }
                              placeholder="Total"
                              className="w-20 rounded-lg border border-border px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                            <Button type="submit" variant="secondary" isLoading={savingLeaveTypeId === type.id}>
                              Save
                            </Button>
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'powers' && (
        <div className="space-y-4">
          {!canUpdate && <p className="text-sm text-ink-muted">You don&apos;t have access to manage powers.</p>}
          {canUpdate && (
            <>
              <p className="text-sm text-ink-muted">
                Hand-pick extra capabilities for this employee, independent of their role.
              </p>
              {powersError && <p className="text-sm text-danger">{powersError}</p>}
              {powersSuccess && <p className="text-sm text-success">Powers updated.</p>}
              <PowerAssignment selectedKeys={powerKeys} onChange={setPowerKeys} />
              <div className="flex justify-end">
                <Button onClick={handleSavePowers} isLoading={isSavingPowers}>
                  Save Powers
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
