import {
  Building2,
  CalendarCheck,
  CalendarClock,
  ClipboardCheck,
  FileCheck2,
  FileText,
  LayoutDashboard,
  MonitorSmartphone,
  RefreshCw,
  Send,
  Settings,
  ShieldAlert,
  Users,
  Wallet,
} from 'lucide-react';
import type { ComponentType } from 'react';

export interface NavItem {
  label: string;
  path: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  disabled?: boolean;
  // When set, the item is hidden entirely (not just permission-gated inside
  // the page) unless the caller holds this permission — e.g. "Provide
  // Leaves" only matters to the subset of Employees who are also HR Team
  // (see hrTeamSync.js), so it shouldn't clutter every employee's sidebar.
  permission?: string;
}

export const SUPER_ADMIN_NAV: NavItem[] = [
  { label: 'Dashboard', path: '/super-admin', icon: LayoutDashboard },
  { label: 'Companies', path: '/super-admin/companies', icon: Building2 },
  { label: 'Users', path: '/super-admin/users', icon: Users },
  { label: 'Settings', path: '/super-admin/settings', icon: Settings },
];

export const COMPANY_ADMIN_NAV: NavItem[] = [
  { label: 'Dashboard', path: '/company-admin', icon: LayoutDashboard },
  { label: 'Employees', path: '/company-admin/employees', icon: Users },
  { label: 'Organization', path: '/company-admin/organization', icon: Building2 },
  { label: 'Shifts & Rosters', path: '/company-admin/shifts-rosters', icon: CalendarCheck },
  { label: 'Approvals', path: '/company-admin/approvals', icon: ClipboardCheck },
  { label: 'Attendance Records', path: '/company-admin/attendance-records', icon: CalendarCheck, permission: 'attendance:read' },
  { label: 'Fraud Attempts', path: '/company-admin/fraud-attempts', icon: ShieldAlert, permission: 'attendance:read' },
  { label: 'Kiosk Accounts', path: '/company-admin/scanner-accounts', icon: MonitorSmartphone, permission: 'scanner_account:create' },
  { label: 'Holidays', path: '/company-admin/holidays', icon: CalendarClock },
  { label: 'Company Policies', path: '/company-admin/policies', icon: FileText },
  { label: 'Provide Leaves', path: '/company-admin/provide-leaves', icon: Wallet, permission: 'leave_balance:adjust' },
  { label: 'Payroll', path: '/company-admin/payroll', icon: Wallet, permission: 'payroll_settings:read' },
  { label: 'Settings', path: '/company-admin/settings', icon: Settings },
];

export const GROUP_ADMIN_NAV: NavItem[] = [
  { label: 'Dashboard', path: '/group-admin', icon: LayoutDashboard },
  { label: 'Companies', path: '/group-admin/companies', icon: Building2 },
  { label: 'Settings', path: '/group-admin/settings', icon: Settings },
];

export const BRAND_ADMIN_NAV: NavItem[] = [
  { label: 'Dashboard', path: '/brand-admin', icon: LayoutDashboard },
  { label: 'Employees', path: '/brand-admin/employees', icon: Users },
  { label: 'Organization', path: '/brand-admin/organization', icon: Building2 },
  { label: 'Shifts & Rosters', path: '/brand-admin/shifts-rosters', icon: CalendarCheck },
  { label: 'Approvals', path: '/brand-admin/approvals', icon: ClipboardCheck },
  { label: 'Attendance Records', path: '/brand-admin/attendance-records', icon: CalendarCheck, permission: 'attendance:read' },
  { label: 'Kiosk Accounts', path: '/brand-admin/scanner-accounts', icon: MonitorSmartphone, permission: 'scanner_account:create' },
  { label: 'Holidays', path: '/brand-admin/holidays', icon: CalendarClock },
  { label: 'Company Policies', path: '/brand-admin/policies', icon: FileText },
  { label: 'Settings', path: '/brand-admin/settings', icon: Settings },
];

export const ESS_NAV: NavItem[] = [
  { label: 'Dashboard', path: '/ess', icon: LayoutDashboard },
  { label: 'My Attendance', path: '/ess/attendance', icon: CalendarCheck },
  { label: 'Leave Balance', path: '/ess/leave-balance', icon: Wallet },
  { label: 'My Leave', path: '/ess/leave', icon: CalendarClock },
  { label: 'Team Approvals', path: '/ess/team-approvals', icon: ClipboardCheck },
  { label: 'My OD', path: '/ess/od', icon: Send },
  { label: 'My Comp-Off', path: '/ess/comp-off', icon: RefreshCw },
  { label: 'My Payslips', path: '/ess/payslips', icon: Wallet },
  { label: 'Yearly Holidays', path: '/ess/holidays', icon: CalendarClock },
  { label: 'Company Policies', path: '/ess/policies', icon: FileText },
  { label: 'Provide Leaves', path: '/ess/provide-leaves', icon: Wallet, permission: 'leave_balance:adjust' },
  {
    label: 'Document Verification',
    path: '/ess/document-verification',
    icon: FileCheck2,
    permission: 'employee_document:verify',
  },
  { label: 'Settings', path: '/ess/settings', icon: Settings },
];
