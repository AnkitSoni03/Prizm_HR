// Structurally matches both api/companyAdmin/approvals.ts's and
// api/ess/leave.ts's LeaveRequestManagerApproval — kept untyped-to-either so
// this works for both the admin-facing and employee-facing leave list pages
// without either importing the other's api module.
export interface ManagerApprovalRow {
  id: string;
  managerEmployeeId: string;
  status: 'pending' | 'approved' | 'rejected' | 'bypassed';
  reason: string | null;
  manager?: { id: string; name: string | null; employeeCode: string | null } | null;
}

// Where the current caller (their own employeeId) currently stands on this
// specific request's manager approval chain — 'pending' means they're one of
// the snapshotted managers and still need to decide; null means either no
// managerApprovals loaded, or they aren't one of this request's managers at
// all (e.g. they only hold the broad `_reports` permission but weren't a
// manager of this particular employee when it was submitted).
export function myManagerApprovalStatus(
  approvals: ManagerApprovalRow[] | undefined,
  myEmployeeId: string | null | undefined
): ManagerApprovalRow['status'] | null {
  if (!approvals || !myEmployeeId) return null;
  const mine = approvals.find((row) => String(row.managerEmployeeId) === String(myEmployeeId));
  return mine ? mine.status : null;
}
