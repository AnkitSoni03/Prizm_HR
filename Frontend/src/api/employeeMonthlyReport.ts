import { apiClient } from './client';

// One employee's Monthly Report (Backend employeeMonthlyReport.service.js).
// Admins only — the backend refuses Super Admin.

export type ReportDayStatus = 'present' | 'on_duty' | 'half_day' | 'leave' | 'absent' | 'holiday' | 'weekoff';

export interface MonthlyReportDay {
  date: string;
  status: ReportDayStatus | null; // null = before joining / upcoming
  code: string | null;
  leaveTypeName: string | null;
  leaveHalfDaySession: 'first_half' | 'second_half' | null;
  checkIn: string | null;
  checkOut: string | null;
  checkoutMissed: boolean;
  workedMinutes: number | null;
  workedMinutesBasis: 'actual' | 'shift' | null;
  source: string | null;
}

// One assigned leave type with its current balance (as of today).
export interface ReportLeaveBalance {
  leaveTypeName: string;
  leaveTypeCode: string | null;
  isPaid: boolean;
  isUnlimited: boolean;
  accrual: string | null;
  linkedToName: string | null; // e.g. Half Day drawing on Annual Leave
  periodStart: string | null;
  periodEnd: string | null;
  carriedForward: number | null;
  allotted: number | null;
  used: number | null;
  balance: number | null;
}

export interface EmployeeMonthlyReport {
  employee: {
    id: string;
    name: string | null;
    employeeCode: string | null;
    companyName: string | null;
    brandName: string | null;
    departmentName: string | null;
    designationName: string | null;
    managerName: string | null;
    rosterName: string | null;
    employmentType: string;
    status: string;
    dateOfJoining: string | null;
    lastWorkingDate: string | null;
    shiftName: string | null;
    shiftTime: string | null;
  };
  year: number;
  month: number;
  daysInMonth: number;
  asOf: string;
  summary: {
    present: number;
    onDuty: number;
    halfDay: number;
    leave: number;
    absent: number;
    holiday: number;
    weekoff: number;
    workedMinutes: number;
    missedCheckouts: number;
    countedDays: number;
    payableDays: number;
    lopDays: number;
    paidLeave: number;
    unpaidLeave: number;
    sandwichLop: number;
    lopDates: string[];
  };
  days: MonthlyReportDay[];
  leaveRequests: {
    id: string;
    leaveTypeName: string;
    isPaid: boolean;
    fromDate: string;
    toDate: string;
    halfDaySession: 'first_half' | 'second_half' | null;
    days: number | null;
    status: string;
    reason: string | null;
    rejectionReason: string | null;
  }[];
  odRequests: {
    id: string;
    fromDate: string;
    toDate: string;
    purpose: string;
    location: string | null;
    status: string;
    rejectionReason: string | null;
  }[];
  regularizations: {
    id: string;
    date: string | null;
    requestedStatus: string;
    requestedCheckIn: string | null;
    requestedCheckOut: string | null;
    reason: string | null;
    status: string;
    rejectionReason: string | null;
  }[];
  compOffCredits: { id: string; earnedDate: string; expiryDate: string | null; status: string }[];
  // Assigned leave types (Roster leave policies) with their CURRENT balance.
  leaveBalances: ReportLeaveBalance[];
  // null = the caller can't view payroll for this employee.
  payroll:
    | null
    | { generated: false }
    | {
        generated: true;
        paidDays: number | null;
        lopDays: number | null;
        monthlyGross: number | null;
        grossEarned: number | null;
        totalDeductions: number | null;
        bonusTotal: number | null;
        carryAdjustment: number | null;
        netPay: number | null;
        revision: number;
        payslipReleased: boolean;
      };
}

export async function getEmployeeMonthlyReport(employeeId: string, year: number, month: number): Promise<EmployeeMonthlyReport> {
  const { data } = await apiClient.get(`/employees/${employeeId}/monthly-report`, { params: { year, month } });
  return data.data;
}

export async function exportEmployeeMonthlyReport(employeeId: string, year: number, month: number): Promise<Blob> {
  const response = await apiClient.get(`/employees/${employeeId}/monthly-report/export`, {
    params: { year, month },
    responseType: 'blob',
  });
  return response.data as Blob;
}
