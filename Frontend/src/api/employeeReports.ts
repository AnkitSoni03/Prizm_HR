import { apiClient } from './client';

// Monthly Report — several employees x any picked months
// (Backend employeePeriodReport.service.js). Admins only; Super Admin refused.

export interface PeriodTotals {
  present: number;
  onDuty: number;
  halfDay: number;
  leave: number;
  absent: number;
  holiday: number;
  weekoff: number;
  workedMinutes: number;
  countedDays: number;
  payableDays: number;
  lopDays: number;
  paidLeave: number;
  unpaidLeave: number;
  sandwichLop: number;
  missedCheckouts: number;
}

export type PeriodMonthRow =
  | { year: number; month: number; available: false }
  | (PeriodTotals & {
      year: number;
      month: number;
      available: true;
      lopDates: string[];
      payroll:
        | null
        | { generated: false }
        | { generated: true; paidDays: number | null; lopDays: number | null; grossEarned: number | null; totalDeductions: number | null; netPay: number | null };
    });

export interface PeriodReportRow {
  employee: {
    id: string;
    name: string | null;
    employeeCode: string | null;
    companyName: string | null;
    brandName: string | null;
    departmentName: string | null;
    designationName: string | null;
    status: string;
    employmentType: string;
    dateOfJoining: string | null;
    lastWorkingDate: string | null;
  };
  totals: PeriodTotals & { netPay: number | null };
  payrollVisible: boolean;
  months: PeriodMonthRow[];
}

interface WithEmployee {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
}

export interface EmployeePeriodReport {
  from: string;
  to: string;
  periodStart: string;
  periodEnd: string;
  asOf: string;
  months: { year: number; month: number }[];
  monthKeys: string[];
  skipped: number;
  rows: PeriodReportRow[];
  leaveRequests: (WithEmployee & {
    leaveTypeName: string;
    isPaid: boolean;
    fromDate: string;
    toDate: string;
    halfDaySession: 'first_half' | 'second_half' | null;
    days: number | null;
    status: string;
    reason: string | null;
    rejectionReason: string | null;
  })[];
  odRequests: (WithEmployee & {
    fromDate: string;
    toDate: string;
    purpose: string;
    location: string | null;
    status: string;
    rejectionReason: string | null;
  })[];
  regularizations: (WithEmployee & {
    date: string | null;
    requestedStatus: string;
    requestedCheckIn: string | null;
    requestedCheckOut: string | null;
    reason: string | null;
    status: string;
    rejectionReason: string | null;
  })[];
  compOffCredits: (WithEmployee & { earnedDate: string; expiryDate: string | null; status: string })[];
}

export interface PeriodReportInput {
  employeeIds: string[];
  months: string[]; // picked months, 'YYYY-MM' (any, not necessarily consecutive)
}

export async function getEmployeePeriodReport(input: PeriodReportInput): Promise<EmployeePeriodReport> {
  const { data } = await apiClient.post('/employees/reports/period', input);
  return data.data;
}

export async function exportEmployeePeriodReport(input: PeriodReportInput): Promise<Blob> {
  const response = await apiClient.post('/employees/reports/period/export', input, { responseType: 'blob' });
  return response.data as Blob;
}
