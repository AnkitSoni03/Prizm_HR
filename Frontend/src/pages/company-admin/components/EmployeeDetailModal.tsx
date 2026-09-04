import { useEffect, useState, type FormEvent } from 'react';
import axios from 'axios';
import { Calendar, Check, CheckCircle2, Copy, FileText, Pencil, Save, Trash2, X } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Tabs } from '../../../components/ui/Tabs';
import { RejectReasonModal } from '../../../components/RejectReasonModal';
import { ChangeRosterModal } from '../../../components/ChangeRosterModal';
import { useAuth } from '../../../context/auth-context';
import { useConfirm } from '../../../context/confirm-context';
import { useToast } from '../../../context/toast-context';
import {
  assignEmployeePowers,
  getEmployee,
  updateEmployee,
  transferEmployee,
  inviteEmployeeUser,
  transferEmployeeLogin,
  setEmployeeActive,
  deleteEmployee,
  uploadEmployeePhoto,
  removeEmployeePhoto,
  renewEmployeeRoster,
  type RosterTransferDetail,
} from '../../../api/companyAdmin/employees';
import { computeRosterExpiry, daysUntil as daysUntilRosterExpiry, rosterExpiryLabel } from '../../../utils/rosterValidity';
import { PhotoUploadField } from '../../../components/ui/PhotoUploadField';
import { FileUploadField } from '../../../components/ui/FileUploadField';
import { FilePreviewModal } from '../../../components/ui/FilePreviewModal';
import { Avatar } from '../../../components/ui/Avatar';
import { formatEmployeeLabel } from '../../../utils/employeeDisplay';
import {
  listEmployeeDocuments,
  uploadEmployeeDocument,
  updateEmployeeDocument,
  deleteEmployeeDocument,
  verifyEmployeeDocument,
  rejectEmployeeDocument,
  listDocumentRequests,
  createDocumentRequest,
  cancelDocumentRequest,
  type EmployeeDocument,
  type DocumentUploadRequest,
} from '../../../api/companyAdmin/employeeDocuments';
import { listPowers } from '../../../api/powers';
import { PowerAssignment } from '../../../components/PowerAssignment';
import { listLeaveBalances, bulkAdjustLeaveBalances, type LeaveBalance } from '../../../api/companyAdmin/leaveBalance';
import type { Brand, Department, Designation, Employee } from '../../../api/tenancy';
import type { RosterPolicyGroup } from '../../../api/companyAdmin/rosterGroups';
import { assignCompOffPolicy, listCompOffPolicies, type CompOffPolicy } from '../../../api/companyAdmin/compOffPolicies';
import { INDIAN_STATES } from '../../../utils/indianStates';
import { holidayAuditName } from '../../../api/companyAdmin/holidays';
import { formatDisplayDate, formatDisplayDateTime, daysUntil } from '../../../utils/dateDisplay';
import { weeklyOffLabel } from '../../../utils/weekdays';
import { listCompOffCredits, type CompOffCredit } from '../../../api/companyAdmin/approvals';

interface EmployeeDetailModalProps {
  employee: Employee;
  brands: Brand[];
  departments: Department[];
  designations: Designation[];
  employees: Employee[];
  // Optional — omitted entirely by call sites that don't manage Roster
  // Groups (e.g. Super Admin's BrandCard, ESS's document-verification view).
  rosterGroups?: RosterPolicyGroup[];
  onClose: () => void;
  onUpdated: () => void;
  // Separate from onUpdated (which also closes this modal, e.g. after
  // saving Details/Transfer) — a photo change should refresh the parent's
  // list (so its avatar picks up the new photo) without closing this modal.
  onPhotoChanged?: () => void;
  // Which tab to open on. Defaults to 'details'; the ESS Document
  // Verification page (a power-holder with no employee:update) opens
  // straight to 'documents' since that's the only tab it cares about.
  initialTab?: 'details' | 'documents' | 'powers' | 'leaves';
}

// Same mapping as ess/MyCompOffPage.tsx's STATUS_TONE.
const COMP_OFF_STATUS_TONE: Record<CompOffCredit['status'], 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending_approval: 'warning',
  approved: 'success',
  rejected: 'danger',
  expired: 'neutral',
  used: 'neutral',
};

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'probation', label: 'Probation' },
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

function docStatusTone(status: EmployeeDocument['status']) {
  if (status === 'verified') return 'success' as const;
  if (status === 'rejected') return 'danger' as const;
  return 'warning' as const;
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
  rosterGroups = [],
  onClose,
  onUpdated,
  onPhotoChanged,
  initialTab = 'details',
}: EmployeeDetailModalProps) {
  const { user, hasPermission } = useAuth();
  const confirm = useConfirm();
  const showToast = useToast();
  const usesBrands = user?.companyUsesBrands ?? true;
  const canUpdate = hasPermission('employee:update');
  const canTransfer = hasPermission('employee:transfer');
  const canDelete = hasPermission('employee:delete');
  const canReadDocs = hasPermission('employee_document:read');
  const canUploadDocs = hasPermission('employee_document:upload');
  const canVerifyDocs = hasPermission('employee_document:verify');
  const canInviteEss = hasPermission('user:invite');
  const canReadLeaveBalances = hasPermission('leave_balance:read');
  const canAdjustLeaveBalances = hasPermission('leave_balance:adjust');

  const [activeTab, setActiveTab] = useState<'details' | 'documents' | 'powers' | 'leaves'>(initialTab);

  const [photoDownloadUrl, setPhotoDownloadUrl] = useState(employee.photoDownloadUrl ?? null);
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);

  // Optional — Super Admin's minimal "name only" creation leaves this
  // unset; this is where Company Admin/Brand Admin assign or correct it.
  const [employeeCode, setEmployeeCode] = useState(employee.employeeCode ?? '');
  const [designationId, setDesignationId] = useState(employee.designationId ?? '');
  const [managerId, setManagerId] = useState(employee.managerId ?? '');
  const [dateOfJoining, setDateOfJoining] = useState(employee.dateOfJoining ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(employee.dateOfBirth ?? '');
  const [employmentType, setEmploymentType] = useState(employee.employmentType);
  const [status, setStatus] = useState(employee.status);
  const [workState, setWorkState] = useState(employee.workState ?? '');
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [transferBrandId, setTransferBrandId] = useState(employee.brandId ?? '');
  const [transferDepartmentId, setTransferDepartmentId] = useState(employee.departmentId ?? '');
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const [essEmail, setEssEmail] = useState('');
  const [isInvitingEss, setIsInvitingEss] = useState(false);
  const [essInviteError, setEssInviteError] = useState<string | null>(null);
  const [essInviteSent, setEssInviteSent] = useState(false);
  const [essActivationToken, setEssActivationToken] = useState<string | null>(null);
  const [isEssLinkCopied, setIsEssLinkCopied] = useState(false);

  const essActivationUrl = essActivationToken
    ? `${window.location.origin}/activate?token=${encodeURIComponent(essActivationToken)}`
    : null;

  // employee.loginUser is only eager-loaded by GET /employees/:id — the
  // `employee` prop comes from the list view, which doesn't include it, so
  // it's fetched here once when this employee actually has a linked login.
  const [linkedUser, setLinkedUser] = useState<Employee['loginUser']>(undefined);
  const [isAccountActive, setIsAccountActive] = useState(employee.isActive);
  const [isTogglingAccount, setIsTogglingAccount] = useState(false);

  const [isTransferFormOpen, setIsTransferFormOpen] = useState(false);
  const [transferLoginEmail, setTransferLoginEmail] = useState('');
  const [isTransferringLogin, setIsTransferringLogin] = useState(false);
  const [transferLoginError, setTransferLoginError] = useState<string | null>(null);
  const [transferInviteSent, setTransferInviteSent] = useState(false);
  const [transferActivationToken, setTransferActivationToken] = useState<string | null>(null);
  const [isTransferLinkCopied, setIsTransferLinkCopied] = useState(false);

  const transferActivationUrl = transferActivationToken
    ? `${window.location.origin}/activate?token=${encodeURIComponent(transferActivationToken)}`
    : null;

  useEffect(() => {
    if (!canInviteEss || !employee.userId) return;
    let cancelled = false;
    getEmployee(employee.id)
      .then((full) => {
        if (!cancelled) setLinkedUser(full.loginUser ?? null);
      })
      .catch(() => {
        if (!cancelled) setLinkedUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [canInviteEss, employee.id, employee.userId]);

  // defaultShift/todayRoster/compOffPolicy (resolved server-side "as of
  // today") aren't on the list-view `employee` prop — same reason
  // customRole/loginUser above need their own fetch of the full
  // GET /employees/:id record.
  const [shiftSummary, setShiftSummary] = useState<
    Pick<Employee, 'defaultShift' | 'todayRoster' | 'compOffPolicy'> | undefined
  >(undefined);

  function refreshShiftSummary() {
    getEmployee(employee.id)
      .then((full) =>
        setShiftSummary({
          defaultShift: full.defaultShift ?? null,
          todayRoster: full.todayRoster ?? null,
          compOffPolicy: full.compOffPolicy ?? null,
        })
      )
      .catch(() => setShiftSummary({ defaultShift: null, todayRoster: null, compOffPolicy: null }));
  }

  useEffect(() => {
    refreshShiftSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  // Assigning a Roster is now the one thing that drives an employee's shift
  // (via the Roster's own linked Shift — see shift.service.js/
  // attendance.service.js::resolveShiftForDate) — manual per-employee
  // default-shift assignment (employee_shifts) no longer has any UI, here or
  // on the Shifts page's "Assign Default Shift" button (removed). Changing
  // it goes through ChangeRosterModal (not a plain field edit) since a
  // Roster switch can leave real leave balance behind — see
  // rosterTransfer.service.js.
  const [isChangeRosterModalOpen, setIsChangeRosterModalOpen] = useState(false);
  const currentRosterGroup = rosterGroups.find((rg) => rg.id === employee.rosterGroupId) ?? null;
  const rosterExpiryDate = currentRosterGroup?.validityValue
    ? computeRosterExpiry(employee.rosterAssignedAt, currentRosterGroup.validityValue, currentRosterGroup.validityUnit)
    : null;
  const rosterExpiryRemaining = rosterExpiryDate ? daysUntilRosterExpiry(rosterExpiryDate) : null;
  const [isRenewingRoster, setIsRenewingRoster] = useState(false);

  async function handleRenewRoster() {
    setIsRenewingRoster(true);
    try {
      await renewEmployeeRoster(employee.id);
      onUpdated();
      showToast('Roster renewed.', 'success');
    } catch {
      showToast('Could not renew this Roster. Please try again.', 'error');
    } finally {
      setIsRenewingRoster(false);
    }
  }

  function handleRosterChanged(details: RosterTransferDetail[]) {
    setIsChangeRosterModalOpen(false);
    if (details.length > 0) {
      const movedCount = details.filter((d) => d.action === 'moved_to_carry_forward').length;
      const resetCount = details.filter((d) => d.action === 'reset').length;
      const parts: string[] = [];
      if (movedCount > 0) parts.push(`${movedCount} moved to Carry Forward`);
      if (resetCount > 0) parts.push(`${resetCount} reset`);
      showToast(parts.length > 0 ? `Roster changed — ${parts.join(', ')}.` : 'Roster changed.', 'success');
    } else {
      showToast('Roster changed.', 'success');
    }
    onUpdated();
  }

  // Comp-off is opt-in (see Comp Off Setting) — this is the same
  // single-employee assign action as that page's bulk Assign Employees tab,
  // just inline here for the common "I'm already looking at this one
  // employee" case. canAssignCompOff also gates the policy-list fetch below
  // so a caller without the permission never makes the call.
  const canAssignCompOff = hasPermission('comp_off_policy:assign');
  const [compOffPolicies, setCompOffPolicies] = useState<CompOffPolicy[]>([]);
  const [assignCompOffPolicyId, setAssignCompOffPolicyId] = useState('');
  const [isAssigningCompOff, setIsAssigningCompOff] = useState(false);
  const [assignCompOffError, setAssignCompOffError] = useState<string | null>(null);

  useEffect(() => {
    if (!canAssignCompOff) return;
    listCompOffPolicies()
      .then(setCompOffPolicies)
      .catch(() => setCompOffPolicies([]));
  }, [canAssignCompOff]);

  // shiftSummary (and the compOffPolicy it carries) resolves asynchronously
  // after mount — sync the picker's initial value once it lands, rather than
  // trying to read it from the list-view `employee` prop, which doesn't
  // have it (same reason shiftSummary itself needs its own fetch above).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAssignCompOffPolicyId(shiftSummary?.compOffPolicy?.id ?? '');
  }, [shiftSummary?.compOffPolicy?.id]);

  async function handleAssignCompOff(event: FormEvent) {
    event.preventDefault();
    setAssignCompOffError(null);
    setIsAssigningCompOff(true);
    try {
      await assignCompOffPolicy({ employeeIds: [employee.id], compOffPolicyId: assignCompOffPolicyId || null });
      refreshShiftSummary();
    } catch (err) {
      setAssignCompOffError(extractError(err, 'Could not assign this Comp-Off Policy. Please try again.'));
    } finally {
      setIsAssigningCompOff(false);
    }
  }

  // This employee's own earned comp-off credits, with their expiry dates —
  // so an admin can see at a glance whether one is about to go to waste,
  // without leaving this modal to cross-reference the company-wide
  // Approvals > Comp-Off tab. Independent of canAssignCompOff (comp_off:read
  // vs comp_off_policy:assign are different grants) and independent of
  // whether the employee is currently enrolled — a credit already earned
  // stays visible/spendable even if they're later un-enrolled.
  const canReadCompOffCredits = hasPermission('comp_off:read');
  const [compOffCredits, setCompOffCredits] = useState<CompOffCredit[]>([]);

  function refreshCompOffCredits() {
    if (!canReadCompOffCredits) return;
    listCompOffCredits({ employeeId: employee.id, limit: 50 })
      .then((result) => setCompOffCredits(result.data))
      .catch(() => setCompOffCredits([]));
  }

  useEffect(() => {
    refreshCompOffCredits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id, canReadCompOffCredits]);

  // Soft toggle — never deletes the employee. Deactivating also blocks their
  // ESS login immediately (see employee.service.js::setEmployeeActiveStatus);
  // reactivating (e.g. a rejoin) restores both in one step.
  async function handleToggleAccount() {
    const nextActive = !isAccountActive;
    const confirmed = await confirm({
      title: nextActive ? 'Activate employee account' : 'Deactivate employee account',
      message: nextActive
        ? `Reactivate ${employee.name ?? employee.employeeCode}'s account? Their ESS login (if any) will regain access immediately.`
        : `Deactivate ${employee.name ?? employee.employeeCode}'s account? Their ESS login (if any) will immediately lose access. No data is deleted, and this can be reversed any time.`,
      confirmLabel: nextActive ? 'Activate' : 'Deactivate',
      variant: nextActive ? 'primary' : 'danger',
    });
    if (!confirmed) return;
    setIsTogglingAccount(true);
    try {
      await setEmployeeActive(employee.id, nextActive);
      setIsAccountActive(nextActive);
      setLinkedUser((prev) => (prev ? { ...prev, isActive: nextActive } : prev));
    } catch {
      showToast("Could not update this employee's account status. Please try again.");
    } finally {
      setIsTogglingAccount(false);
    }
  }

  const [isDeleting, setIsDeleting] = useState(false);

  // Irreversible — unlike handleToggleAccount above (a reversible on/off
  // switch), this actually erases the Employee row and every record tied to
  // it (attendance, leave/OD/regularization/comp-off, documents, payroll,
  // face profile) plus their attendance videos on cloud storage. See
  // employee.service.js::deleteEmployee for exactly what gets removed.
  async function handleDeletePermanently() {
    const confirmed = await confirm({
      title: 'Delete employee permanently',
      message: `Permanently delete ${employee.name ?? employee.employeeCode}? This erases their attendance history (including recorded attendance videos on the cloud), leave/OD/regularization/comp-off records, documents, and payroll data. This cannot be undone.`,
      confirmLabel: 'Delete Permanently',
      variant: 'danger',
    });
    if (!confirmed) return;
    setIsDeleting(true);
    try {
      await deleteEmployee(employee.id);
      onUpdated();
    } catch (err) {
      showToast(extractError(err, 'Could not delete this employee. Please try again.'));
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleCopyTransferActivationUrl() {
    if (!transferActivationUrl) return;
    await navigator.clipboard.writeText(transferActivationUrl);
    setIsTransferLinkCopied(true);
    setTimeout(() => setIsTransferLinkCopied(false), 2000);
  }

  // Doesn't call onUpdated() — same reasoning as handleInviteEss below, so
  // the success message/activation link stays visible instead of vanishing.
  async function handleTransferLogin(event: FormEvent) {
    event.preventDefault();
    setTransferLoginError(null);
    setIsTransferringLogin(true);
    try {
      const result = await transferEmployeeLogin(employee.id, transferLoginEmail);
      setTransferActivationToken(result.activationToken ?? null);
      setTransferInviteSent(true);
      // The new User row defaults isActive: true — it just hasn't been
      // activated (status stays 'invited' until the link is used).
      setLinkedUser({ id: result.user.id, email: result.user.email, isActive: true, status: result.user.status });
    } catch (err) {
      // Backend now only commits the transfer once the new activation email
      // is confirmed sent (a failed send rolls back the whole transfer,
      // including reactivating the old login), so this message is the real
      // reason nothing changed — not just a generic catch-all.
      setTransferLoginError(extractError(err, 'Could not send the new activation email. Please try again.'));
    } finally {
      setIsTransferringLogin(false);
    }
  }

  const [documents, setDocuments] = useState<EmployeeDocument[] | null>(null);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<EmployeeDocument | null>(null);
  const [docType, setDocType] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (activeTab !== 'documents' || documents !== null || !canReadDocs) return;
    listEmployeeDocuments(employee.id)
      .then(setDocuments)
      .catch(() => setDocsError('Could not load documents.'));
  }, [activeTab, documents, canReadDocs, employee.id]);

  const [documentRequests, setDocumentRequests] = useState<DocumentUploadRequest[] | null>(null);
  const [requestDocType, setRequestDocType] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [isRequestingDoc, setIsRequestingDoc] = useState(false);
  const [requestDocError, setRequestDocError] = useState<string | null>(null);
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== 'documents' || documentRequests !== null || !canVerifyDocs) return;
    listDocumentRequests(employee.id)
      .then(setDocumentRequests)
      .catch(() => setDocumentRequests([]));
  }, [activeTab, documentRequests, canVerifyDocs, employee.id]);

  async function handleRequestDocument(event: FormEvent) {
    event.preventDefault();
    if (!requestDocType) return;
    setRequestDocError(null);
    setIsRequestingDoc(true);
    try {
      const request = await createDocumentRequest(employee.id, {
        documentType: requestDocType,
        note: requestNote || undefined,
      });
      setDocumentRequests((prev) => [request, ...(prev ?? [])]);
      setRequestDocType('');
      setRequestNote('');
    } catch (err) {
      setRequestDocError(extractError(err, 'Could not send this request. Please try again.'));
    } finally {
      setIsRequestingDoc(false);
    }
  }

  async function handleCancelRequest(request: DocumentUploadRequest) {
    setCancellingRequestId(request.id);
    try {
      const updated = await cancelDocumentRequest(employee.id, request.id);
      setDocumentRequests((prev) => (prev ? prev.map((r) => (r.id === updated.id ? updated : r)) : prev));
    } catch {
      showToast('Could not cancel this request. Please try again.');
    } finally {
      setCancellingRequestId(null);
    }
  }

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

  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[] | null>(null);
  const [leaveBalancesError, setLeaveBalancesError] = useState<string | null>(null);
  // Both keyed by LeaveBalance.id — only holds a row once its input has been
  // touched, so "no edits yet" (Save disabled) is a plain empty-object check.
  const [editedAllotted, setEditedAllotted] = useState<Record<string, string>>({});
  const [editedUsed, setEditedUsed] = useState<Record<string, string>>({});
  const [isSavingLeaves, setIsSavingLeaves] = useState(false);
  const [leavesSaveError, setLeavesSaveError] = useState<string | null>(null);
  const [leavesSaveSuccess, setLeavesSaveSuccess] = useState(false);

  const leaveBalanceYear = new Date().getFullYear();

  useEffect(() => {
    if (activeTab !== 'leaves' || !canReadLeaveBalances || leaveBalances !== null) return;
    listLeaveBalances({ employeeId: employee.id, year: leaveBalanceYear })
      .then(setLeaveBalances)
      .catch(() => setLeaveBalancesError('Could not load leave balances.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, canReadLeaveBalances, leaveBalances, employee.id]);

  function isRowChanged(b: LeaveBalance): boolean {
    return (
      (editedAllotted[b.id] !== undefined && Number(editedAllotted[b.id]) !== Number(b.allotted)) ||
      (editedUsed[b.id] !== undefined && Number(editedUsed[b.id]) !== Number(b.used))
    );
  }

  const hasLeaveChanges = leaveBalances?.some(isRowChanged) ?? false;

  // Doesn't call onUpdated() — same reasoning as handleSavePowers above, so
  // the success message stays visible instead of vanishing immediately.
  async function handleSaveLeaves() {
    if (!leaveBalances) return;
    const adjustments = leaveBalances
      .filter(isRowChanged)
      .map((b) => ({
        leaveTypeId: b.leaveTypeId,
        year: b.year,
        month: b.month,
        allotted: editedAllotted[b.id] !== undefined ? Number(editedAllotted[b.id]) : Number(b.allotted),
        used: editedUsed[b.id] !== undefined ? Number(editedUsed[b.id]) : Number(b.used),
      }));
    if (adjustments.length === 0) return;
    setLeavesSaveError(null);
    setLeavesSaveSuccess(false);
    setIsSavingLeaves(true);
    try {
      await bulkAdjustLeaveBalances({ employeeId: employee.id, adjustments });
      const refreshed = await listLeaveBalances({ employeeId: employee.id, year: leaveBalanceYear });
      setLeaveBalances(refreshed);
      setEditedAllotted({});
      setEditedUsed({});
      setLeavesSaveSuccess(true);
    } catch (err) {
      setLeavesSaveError(extractError(err, 'Could not save leave balances. Please try again.'));
    } finally {
      setIsSavingLeaves(false);
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
        employeeCode: employeeCode.trim() || null,
        designationId: designationId || null,
        employmentType,
        status,
        dateOfJoining: dateOfJoining || null,
        dateOfBirth: dateOfBirth || null,
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
      setEssInviteSent(true);
    } catch (err) {
      // Backend now only creates the invite once the activation email is
      // confirmed sent (a failed send rolls back the whole invite), so this
      // message is the real reason nothing went out — not just a generic
      // catch-all.
      setEssInviteError(extractError(err, 'Could not send the invitation email. Please try again.'));
    } finally {
      setIsInvitingEss(false);
    }
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!docType || !docFile) return;
    setDocsError(null);
    setIsUploading(true);
    try {
      const doc = await uploadEmployeeDocument(employee.id, { type: docType, file: docFile });
      setDocuments((prev) => (prev ? [...prev, doc] : [doc]));
      setDocType('');
      setDocFile(null);
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

  const [rejectingDoc, setRejectingDoc] = useState<EmployeeDocument | null>(null);

  async function handleRejectConfirm(reason: string) {
    if (!rejectingDoc) return;
    const updated = await rejectEmployeeDocument(employee.id, rejectingDoc.id, reason);
    setDocuments((prev) => (prev ? prev.map((d) => (d.id === updated.id ? updated : d)) : prev));
    setRejectingDoc(null);
  }

  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editingDocType, setEditingDocType] = useState('');
  const [isSavingDocType, setIsSavingDocType] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  function handleStartEditDoc(doc: EmployeeDocument) {
    setEditingDocId(doc.id);
    setEditingDocType(doc.type);
  }

  async function handleSaveDocType(doc: EmployeeDocument) {
    if (!editingDocType.trim() || editingDocType === doc.type) {
      setEditingDocId(null);
      return;
    }
    setIsSavingDocType(true);
    try {
      const updated = await updateEmployeeDocument(employee.id, doc.id, editingDocType.trim());
      setDocuments((prev) => (prev ? prev.map((d) => (d.id === updated.id ? updated : d)) : prev));
      setEditingDocId(null);
    } catch {
      showToast('Could not update this document. Please try again.');
    } finally {
      setIsSavingDocType(false);
    }
  }

  async function handleDeleteDoc(doc: EmployeeDocument) {
    const confirmed = await confirm({
      title: 'Delete document',
      message: `Delete "${doc.type}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    setDeletingDocId(doc.id);
    try {
      await deleteEmployeeDocument(employee.id, doc.id);
      setDocuments((prev) => (prev ? prev.filter((d) => d.id !== doc.id) : prev));
    } catch {
      showToast('Could not delete this document. Please try again.');
    } finally {
      setDeletingDocId(null);
    }
  }

  return (
    <>
      <Modal
        title={employee.name ?? employee.employeeCode}
        onClose={onClose}
        widthClassName="max-w-2xl"
      tabs={
        <Tabs
          items={[
            { key: 'details', label: 'Details' },
            { key: 'documents', label: 'Documents' },
            { key: 'powers', label: 'Powers' },
            { key: 'leaves', label: 'Leaves' },
          ]}
          active={activeTab}
          onChange={(key) => setActiveTab(key as 'details' | 'documents' | 'powers' | 'leaves')}
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
            <p className="text-ink">{employee.employeeCode ?? 'Not set'}</p>
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

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-page px-4 py-3">
            <div>
              <p className="text-sm font-medium text-ink">Account Status</p>
              <p className="text-xs text-ink-muted">
                {isAccountActive
                  ? 'This employee is active. Their ESS login (if any) can log in normally.'
                  : 'This employee is deactivated. Their ESS login (if any) cannot log in. No data was deleted.'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone={isAccountActive ? 'success' : 'danger'}>
                {isAccountActive ? 'Active' : 'Inactive'}
              </Badge>
              {canUpdate && (
                <Button
                  type="button"
                  variant={isAccountActive ? 'danger' : 'secondary'}
                  isLoading={isTogglingAccount}
                  onClick={handleToggleAccount}
                >
                  {isAccountActive ? 'Deactivate' : 'Activate'}
                </Button>
              )}
            </div>
          </div>

          {shiftSummary && (
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Roster</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border border-border bg-page px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Assigned Roster</p>
                  <p className="mt-1 text-sm text-ink">
                    {rosterGroups.find((rg) => rg.id === employee.rosterGroupId)?.name ?? 'None — company/brand-wide defaults'}
                  </p>
                  {rosterExpiryRemaining !== null && (
                    <Badge tone={rosterExpiryRemaining <= 3 ? 'danger' : rosterExpiryRemaining <= 7 ? 'warning' : 'neutral'}>
                      {rosterExpiryLabel(rosterExpiryRemaining)}
                    </Badge>
                  )}
                </div>
                <div className="rounded-lg border border-border bg-page px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Shift</p>
                  {shiftSummary.todayRoster?.shift ? (
                    <>
                      <p className="mt-1 text-sm text-ink">
                        {shiftSummary.todayRoster.shift.name} · {shiftSummary.todayRoster.shift.startTime.slice(0, 5)}–
                        {shiftSummary.todayRoster.shift.endTime.slice(0, 5)}
                        <span className="ml-1.5 text-xs text-warning">(published override)</span>
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">
                        Week Off: {weeklyOffLabel(shiftSummary.todayRoster.shift.weeklyOffDays)}
                      </p>
                    </>
                  ) : shiftSummary.defaultShift ? (
                    <>
                      <p className="mt-1 text-sm text-ink">
                        {shiftSummary.defaultShift.name} · {shiftSummary.defaultShift.startTime.slice(0, 5)}–
                        {shiftSummary.defaultShift.endTime.slice(0, 5)}
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">
                        Week Off: {weeklyOffLabel(shiftSummary.defaultShift.weeklyOffDays)}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-ink-muted">Following Roster / default shift</p>
                  )}
                </div>
                <div className="rounded-lg border border-border bg-page px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Comp-Off</p>
                  {shiftSummary.compOffPolicy ? (
                    <p className="mt-1 text-sm">
                      <Badge tone="success">Active</Badge>
                      <span className="ml-1.5 text-ink-muted">{shiftSummary.compOffPolicy.name}</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-sm">
                      <Badge tone="neutral">Not Enrolled</Badge>
                    </p>
                  )}
                </div>
              </div>

              {canUpdate && (
                <div className="flex justify-end gap-2">
                  {rosterExpiryRemaining !== null && (
                    <Button type="button" variant="secondary" onClick={handleRenewRoster} isLoading={isRenewingRoster}>
                      Renew
                    </Button>
                  )}
                  <Button type="button" variant="secondary" onClick={() => setIsChangeRosterModalOpen(true)}>
                    Change Roster
                  </Button>
                </div>
              )}

              {canAssignCompOff && (
                <form onSubmit={handleAssignCompOff} className="space-y-3">
                  {assignCompOffError && <p className="text-sm text-danger">{assignCompOffError}</p>}
                  <Select
                    id="employee-assign-comp-off"
                    label="Comp-Off Policy"
                    value={assignCompOffPolicyId}
                    onChange={(event) => setAssignCompOffPolicyId(event.target.value)}
                    placeholder="Not enrolled"
                    options={compOffPolicies.map((p) => ({ value: p.id, label: p.name }))}
                  />
                  <p className="text-xs text-ink-muted">
                    Comp-off is opt-in — this employee earns no credit for working a holiday/week-off until
                    enrolled here.
                  </p>
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      variant="secondary"
                      isLoading={isAssigningCompOff}
                      disabled={assignCompOffPolicyId === (shiftSummary?.compOffPolicy?.id ?? '')}
                    >
                      {assignCompOffPolicyId ? 'Assign Comp-Off' : 'Remove from Comp-Off'}
                    </Button>
                  </div>
                </form>
              )}

              {canReadCompOffCredits && compOffCredits.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
                    Comp-Off Credits
                  </p>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-page text-xs text-ink-muted">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Earned</th>
                          <th className="px-3 py-2 text-left font-medium">Expires</th>
                          <th className="px-3 py-2 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {compOffCredits.map((credit) => {
                          const daysLeft = credit.expiryDate ? daysUntil(credit.expiryDate) : null;
                          // Only a still-unused (approved) credit can be
                          // "wasted" — one already used/rejected/expired has
                          // nothing left to warn about.
                          const expiringSoon =
                            credit.status === 'approved' && daysLeft !== null && daysLeft >= 0 && daysLeft <= 14;
                          return (
                            <tr key={credit.id}>
                              <td className="px-3 py-2 text-ink">{formatDisplayDate(credit.earnedDate)}</td>
                              <td className="px-3 py-2">
                                <span className="text-ink">
                                  {credit.expiryDate ? formatDisplayDate(credit.expiryDate) : 'Never'}
                                </span>
                                {expiringSoon && (
                                  <span className="ml-1.5">
                                    <Badge tone="warning">
                                      {daysLeft === 0 ? 'Expires today' : `${daysLeft}d left`}
                                    </Badge>
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <Badge tone={COMP_OFF_STATUS_TONE[credit.status]}>
                                  {credit.status.replace('_', ' ')}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSaveDetails} className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Edit Details</p>
            {detailsError && <p className="text-sm text-danger">{detailsError}</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="employee-code-edit"
                label="Employee Code"
                value={employeeCode}
                onChange={(event) => setEmployeeCode(event.target.value)}
                disabled={!canUpdate}
                placeholder="Not set"
              />
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
                  .map((e) => ({ value: e.id, label: formatEmployeeLabel(e) }))}
              />
              <Input
                id="employee-doj-edit"
                label="Date of Joining"
                type="date"
                value={dateOfJoining}
                onChange={(event) => setDateOfJoining(event.target.value)}
                disabled={!canUpdate}
              />
              <Input
                id="employee-dob-edit"
                label="Date of Birth"
                type="date"
                value={dateOfBirth}
                onChange={(event) => setDateOfBirth(event.target.value)}
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

              {employee.userId && !essInviteSent && !transferInviteSent && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm text-ink-muted">Logs in with</p>
                      <p className="text-sm font-medium text-ink">
                        {linkedUser === undefined ? 'Loading…' : (linkedUser?.email ?? '—')}
                      </p>
                    </div>
                    {linkedUser && (
                      <Badge tone={linkedUser.isActive ? 'success' : 'danger'}>
                        {linkedUser.isActive ? 'Login Active' : 'Login Inactive'}
                      </Badge>
                    )}
                  </div>

                  {!isTransferFormOpen ? (
                    <Button type="button" variant="secondary" onClick={() => setIsTransferFormOpen(true)}>
                      Transfer to another email
                    </Button>
                  ) : (
                    <form onSubmit={handleTransferLogin} className="space-y-3">
                      <p className="text-sm text-ink-muted">
                        Moving this employee to a new email deactivates the current login and sends a fresh
                        activation link to the new address. Nothing else about this employee changes.
                      </p>
                      {transferLoginError && <p className="text-sm text-danger">{transferLoginError}</p>}
                      <Input
                        id="employee-transfer-login-email"
                        label="New Email"
                        type="email"
                        required
                        value={transferLoginEmail}
                        onChange={(event) => setTransferLoginEmail(event.target.value)}
                        placeholder="new-address@company.com"
                      />
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setIsTransferFormOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" isLoading={isTransferringLogin}>
                          Transfer
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {transferInviteSent && (
                <div className="space-y-3">
                  <p className="text-sm text-success">
                    This login was transferred to <span className="font-medium">{transferLoginEmail}</span>. A
                    new activation email was sent.
                  </p>
                  {transferActivationUrl && (
                    <div className="w-full rounded-xl border border-border bg-page p-3 text-left">
                      <p className="mb-1 text-xs font-medium text-ink-muted">
                        Activation link (dev only — no email provider configured yet):
                      </p>
                      <div className="flex items-center gap-2">
                        <a
                          href={transferActivationUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block flex-1 break-all text-xs text-primary hover:underline"
                        >
                          {transferActivationUrl}
                        </a>
                        <button
                          type="button"
                          onClick={handleCopyTransferActivationUrl}
                          aria-label="Copy activation link"
                          className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-card hover:text-ink"
                        >
                          {isTransferLinkCopied ? (
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

              {!employee.userId && !essInviteSent && (
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

              {essInviteSent && (
                <div className="space-y-3">
                  <p className="text-sm text-success">
                    Invitation email sent to <span className="font-medium">{essEmail}</span>.
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

          {canDelete && (
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-danger">Danger Zone</p>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">Delete Permanently</p>
                  <p className="text-xs text-ink-muted">
                    Erases this employee and all their records — attendance (including cloud
                    videos), leave/OD/regularization/comp-off, documents, and payroll. Cannot be
                    undone.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="danger"
                  isLoading={isDeleting}
                  onClick={handleDeletePermanently}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  Delete Permanently
                </Button>
              </div>
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
                  {documents.map((doc) => {
                    const isEditing = editingDocId === doc.id;
                    const canChange = canUploadDocs && doc.status !== 'verified';
                    const decidedLabel =
                      doc.status === 'verified' ? 'Verified' : doc.status === 'rejected' ? 'Rejected' : null;
                    return (
                      <div key={doc.id} className="rounded-xl border border-border px-4 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex flex-1 items-center gap-2.5">
                            <FileText className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
                            <div className="min-w-0 flex-1">
                              {isEditing ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    autoFocus
                                    value={editingDocType}
                                    onChange={(event) => setEditingDocType(event.target.value)}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') handleSaveDocType(doc);
                                      if (event.key === 'Escape') setEditingDocId(null);
                                    }}
                                    className="w-full rounded-lg border border-border px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveDocType(doc)}
                                    disabled={isSavingDocType}
                                    aria-label="Save"
                                    className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-success disabled:opacity-50"
                                  >
                                    <Check className="h-3.5 w-3.5" strokeWidth={2} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingDocId(null)}
                                    aria-label="Cancel"
                                    className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-ink"
                                  >
                                    <X className="h-3.5 w-3.5" strokeWidth={2} />
                                  </button>
                                </div>
                              ) : (
                                <p className="text-sm font-medium text-ink">{doc.type}</p>
                              )}
                              {doc.fileDownloadUrl ? (
                                <button
                                  type="button"
                                  onClick={() => setPreviewDoc(doc)}
                                  className="text-xs text-primary hover:underline"
                                >
                                  View file
                                </button>
                              ) : (
                                <span className="text-xs text-ink-muted">File unavailable</span>
                              )}
                              {decidedLabel && (
                                <p className="mt-0.5 text-xs text-ink-muted">
                                  {decidedLabel} by {holidayAuditName(doc.verifier) ?? 'someone no longer in the system'}
                                  {doc.verifiedAt ? ` on ${formatDisplayDateTime(doc.verifiedAt)}` : ''}
                                </p>
                              )}
                              {doc.status === 'rejected' && doc.rejectionReason && (
                                <p className="mt-0.5 text-xs text-danger">Reason: {doc.rejectionReason}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Badge
                              tone={docStatusTone(doc.status)}
                              title={doc.status === 'rejected' ? doc.rejectionReason ?? undefined : undefined}
                            >
                              {doc.status === 'verified' ? 'Verified' : doc.status === 'rejected' ? 'Rejected' : 'Pending'}
                            </Badge>
                            {canVerifyDocs && doc.status !== 'verified' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleVerify(doc)}
                                  aria-label={`Verify ${doc.type}`}
                                  title="Verify"
                                  className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-success"
                                >
                                  <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRejectingDoc(doc)}
                                  aria-label={`Reject ${doc.type}`}
                                  title="Reject"
                                  className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
                                >
                                  <X className="h-4 w-4" strokeWidth={1.75} />
                                </button>
                              </>
                            )}
                            {canChange && !isEditing && (
                              <button
                                type="button"
                                onClick={() => handleStartEditDoc(doc)}
                                aria-label={`Edit ${doc.type}`}
                                title="Edit title"
                                className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-ink"
                              >
                                <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                              </button>
                            )}
                            {canChange && (
                              <button
                                type="button"
                                onClick={() => handleDeleteDoc(doc)}
                                disabled={deletingDocId === doc.id}
                                aria-label={`Delete ${doc.type}`}
                                title="Delete"
                                className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {canVerifyDocs && (
                <div className="space-y-3 border-t border-border pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Requested Documents
                  </p>
                  {documentRequests && documentRequests.filter((r) => r.status === 'pending').length > 0 && (
                    <div className="space-y-2">
                      {documentRequests
                        .filter((r) => r.status === 'pending')
                        .map((request) => (
                          <div
                            key={request.id}
                            className="flex items-center justify-between rounded-xl border border-border px-4 py-2.5"
                          >
                            <div>
                              <p className="text-sm font-medium text-ink">{request.documentType}</p>
                              {request.note && <p className="text-xs text-ink-muted">{request.note}</p>}
                              <p className="text-xs text-ink-muted">
                                Requested by {holidayAuditName(request.requestedBy) ?? 'someone no longer in the system'}
                                {' · '}
                                {formatDisplayDateTime(request.createdAt)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge tone="warning">Pending</Badge>
                              <button
                                type="button"
                                onClick={() => handleCancelRequest(request)}
                                disabled={cancellingRequestId === request.id}
                                className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                                aria-label={`Cancel request for ${request.documentType}`}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                  {documentRequests && documentRequests.filter((r) => r.status === 'pending').length === 0 && (
                    <p className="text-sm text-ink-muted">No pending document requests.</p>
                  )}

                  <form onSubmit={handleRequestDocument} className="space-y-4">
                    {requestDocError && <p className="text-sm text-danger">{requestDocError}</p>}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Input
                        id="request-doc-type"
                        label="Document to request"
                        required
                        value={requestDocType}
                        onChange={(event) => setRequestDocType(event.target.value)}
                        placeholder="e.g. Aadhaar Card"
                      />
                      <Input
                        id="request-doc-note"
                        label="Note (optional)"
                        value={requestNote}
                        onChange={(event) => setRequestNote(event.target.value)}
                        placeholder="e.g. Please re-upload, previous copy was blurry"
                      />
                    </div>
                    <p className="text-xs text-ink-muted">
                      The employee gets a notification right away asking them to upload this document.
                    </p>
                    <div className="flex justify-end">
                      <Button type="submit" variant="secondary" isLoading={isRequestingDoc} disabled={!requestDocType}>
                        Request Document
                      </Button>
                    </div>
                  </form>
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
                    <FileUploadField file={docFile} onSelect={setDocFile} disabled={isUploading} />
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" variant="secondary" isLoading={isUploading} disabled={!docType || !docFile}>
                      Add Document
                    </Button>
                  </div>
                </form>
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

      {activeTab === 'leaves' && (
        <div className="space-y-4">
          {!canReadLeaveBalances && (
            <p className="text-sm text-ink-muted">You don&apos;t have access to leave balances.</p>
          )}
          {canReadLeaveBalances && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-page px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Calendar className="h-4.5 w-4.5" strokeWidth={1.75} />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink">Leave Balance · {leaveBalanceYear}</p>
                    <p className="text-xs text-ink-muted">
                      {canAdjustLeaveBalances
                        ? 'Edit Allotted or Used below, then save.'
                        : 'Read-only — you do not have permission to edit this.'}
                    </p>
                  </div>
                </div>
                {canAdjustLeaveBalances && leaveBalances && leaveBalances.length > 0 && (
                  <Button onClick={handleSaveLeaves} isLoading={isSavingLeaves} disabled={!hasLeaveChanges}>
                    <Save className="h-4 w-4" strokeWidth={1.75} />
                    Save Changes
                  </Button>
                )}
              </div>

              {leaveBalancesError && <p className="text-sm text-danger">{leaveBalancesError}</p>}
              {leaveBalances === null && !leaveBalancesError && (
                <p className="text-sm text-ink-muted">Loading…</p>
              )}
              {leaveBalances?.length === 0 && (
                <p className="text-sm text-ink-muted">
                  No leave balances yet — this fills in once a Roster with a Leave Policy is assigned.
                </p>
              )}

              {leaveBalances && leaveBalances.length > 0 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {leaveBalances.map((b) => {
                    const editedAllottedValue = editedAllotted[b.id];
                    const editedUsedValue = editedUsed[b.id];
                    const allottedDisplay = editedAllottedValue ?? String(b.allotted);
                    const usedDisplay = editedUsedValue ?? String(b.used);
                    const parsedAllotted =
                      editedAllottedValue !== undefined ? Number(editedAllottedValue) : Number(b.allotted);
                    const parsedUsed = editedUsedValue !== undefined ? Number(editedUsedValue) : Number(b.used);
                    const liveBalance =
                      Number.isFinite(parsedAllotted) && Number.isFinite(parsedUsed)
                        ? Math.round((parsedAllotted - parsedUsed) * 100) / 100
                        : Number(b.balance);
                    const usagePct =
                      parsedAllotted > 0 ? Math.min(100, Math.max(0, (parsedUsed / parsedAllotted) * 100)) : 0;
                    const isOverUsed = liveBalance < 0;
                    const rowChanged = isRowChanged(b);

                    return (
                      <div
                        key={b.id}
                        className={[
                          'rounded-xl border bg-page p-4 transition-colors',
                          rowChanged ? 'border-primary/40 bg-primary-light' : 'border-border',
                        ].join(' ')}
                      >
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-ink">{b.leaveType?.name ?? 'Unknown'}</p>
                          {b.month && <Badge tone="neutral">This month</Badge>}
                        </div>

                        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-border">
                          <div
                            className={`h-full rounded-full transition-all ${isOverUsed ? 'bg-danger' : 'bg-primary'}`}
                            style={{ width: `${usagePct}%` }}
                          />
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label
                              htmlFor={`leave-allotted-${b.id}`}
                              className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted"
                            >
                              Allotted
                            </label>
                            {canAdjustLeaveBalances ? (
                              <input
                                id={`leave-allotted-${b.id}`}
                                type="number"
                                step="0.5"
                                min="0"
                                value={allottedDisplay}
                                onChange={(event) =>
                                  setEditedAllotted((prev) => ({ ...prev, [b.id]: event.target.value }))
                                }
                                className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                              />
                            ) : (
                              <p className="px-0.5 py-1.5 text-sm text-ink">{b.allotted}</p>
                            )}
                          </div>
                          <div>
                            <label
                              htmlFor={`leave-used-${b.id}`}
                              className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted"
                            >
                              Used
                            </label>
                            {canAdjustLeaveBalances ? (
                              <input
                                id={`leave-used-${b.id}`}
                                type="number"
                                step="0.5"
                                min="0"
                                value={usedDisplay}
                                onChange={(event) =>
                                  setEditedUsed((prev) => ({ ...prev, [b.id]: event.target.value }))
                                }
                                className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                              />
                            ) : (
                              <p className="px-0.5 py-1.5 text-sm text-ink">{b.used}</p>
                            )}
                          </div>
                          <div>
                            <p className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                              Balance
                            </p>
                            <p className={`px-0.5 py-1.5 text-sm font-semibold ${isOverUsed ? 'text-danger' : 'text-ink'}`}>
                              {liveBalance}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {leavesSaveError && <p className="text-sm text-danger">{leavesSaveError}</p>}
              {leavesSaveSuccess && (
                <p className="text-sm text-success">Leave balances updated — the employee has been notified.</p>
              )}
            </>
          )}
        </div>
      )}
      </Modal>
      {previewDoc && (
        <FilePreviewModal
          title={previewDoc.type}
          fileUrl={previewDoc.fileUrl}
          previewUrl={previewDoc.fileDownloadUrl}
          downloadUrl={previewDoc.fileAttachmentUrl}
          onClose={() => setPreviewDoc(null)}
        />
      )}
      {rejectingDoc && (
        <RejectReasonModal
          title={`Reject ${rejectingDoc.type}`}
          onClose={() => setRejectingDoc(null)}
          onConfirm={handleRejectConfirm}
        />
      )}
      {isChangeRosterModalOpen && (
        <ChangeRosterModal
          employeeId={employee.id}
          currentRosterGroupId={employee.rosterGroupId}
          rosterGroups={rosterGroups}
          onClose={() => setIsChangeRosterModalOpen(false)}
          onChanged={handleRosterChanged}
        />
      )}
    </>
  );
}
