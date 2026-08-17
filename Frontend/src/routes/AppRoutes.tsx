import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { LoginPage } from '../pages/auth/LoginPage';
import { KioskPage } from '../pages/kiosk/KioskPage';
import { ActivatePage } from '../pages/auth/ActivatePage';
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../pages/auth/ResetPasswordPage';
import { SuperAdminDashboard } from '../pages/super-admin/SuperAdminDashboard';
import { CompaniesPage } from '../pages/super-admin/CompaniesPage';
import { CompanyDetailPage } from '../pages/super-admin/CompanyDetailPage';
import { GroupDetailPage } from '../pages/super-admin/GroupDetailPage';
import { UsersPage } from '../pages/super-admin/UsersPage';
import { SettingsPage as SuperAdminSettingsPage } from '../pages/super-admin/SettingsPage';
import { CompanyAdminDashboard } from '../pages/company-admin/CompanyAdminDashboard';
import { EmployeesPage } from '../pages/company-admin/EmployeesPage';
import { ShiftsRostersPage } from '../pages/company-admin/ShiftsRostersPage';
import { ApprovalsPage } from '../pages/company-admin/ApprovalsPage';
import { PayrollPage } from '../pages/company-admin/PayrollPage';
import {
  ScannerAccountsPage as CompanyAdminScannerAccountsPage,
  ScannerAccountsPage as BrandAdminScannerAccountsPage,
} from '../pages/company-admin/ScannerAccountsPage';
import {
  AttendanceRecordsPage as CompanyAdminAttendanceRecordsPage,
  AttendanceRecordsPage as BrandAdminAttendanceRecordsPage,
} from '../pages/company-admin/AttendanceRecordsPage';
import {
  AttendanceBoardPage as CompanyAdminAttendanceBoardPage,
  AttendanceBoardPage as BrandAdminAttendanceBoardPage,
} from '../pages/company-admin/AttendanceBoardPage';
import { FraudAttemptsPage } from '../pages/company-admin/FraudAttemptsPage';
import {
  HolidaysPage as CompanyAdminHolidaysPage,
  HolidaysPage as BrandAdminHolidaysPage,
} from '../pages/company-admin/HolidaysPage';
import {
  RosterGroupsPage as CompanyAdminRosterGroupsPage,
  RosterGroupsPage as BrandAdminRosterGroupsPage,
} from '../pages/company-admin/RosterGroupsPage';
import { LeavePolicySettingsPage as CompanyAdminLeavePolicySettingsPage } from '../pages/company-admin/LeavePolicySettingsPage';
import {
  OrganizationPage as CompanyAdminOrganizationPage,
  OrganizationPage as BrandAdminOrganizationPage,
} from '../pages/company-admin/OrganizationPage';
import {
  CompanyPoliciesPage as CompanyAdminPoliciesPage,
  CompanyPoliciesPage as BrandAdminPoliciesPage,
  CompanyPoliciesPage as EssPoliciesPage,
} from '../pages/company-admin/CompanyPoliciesPage';
import {
  ProvideLeavesPage as CompanyAdminProvideLeavesPage,
  ProvideLeavesPage as EssProvideLeavesPage,
} from '../pages/company-admin/ProvideLeavesPage';
import { SettingsPage as CompanyAdminSettingsPage } from '../pages/company-admin/SettingsPage';
import { GroupAdminDashboard } from '../pages/group-admin/GroupAdminDashboard';
import { CompaniesPage as GroupCompaniesPage } from '../pages/group-admin/CompaniesPage';
import { CompanyDetailPage as GroupCompanyDetailPage } from '../pages/group-admin/CompanyDetailPage';
import { SettingsPage as GroupAdminSettingsPage } from '../pages/group-admin/SettingsPage';
import { BrandAdminDashboard } from '../pages/brand-admin/BrandAdminDashboard';
import { EmployeesPage as BrandEmployeesPage } from '../pages/brand-admin/EmployeesPage';
import { ShiftsRostersPage as BrandShiftsRostersPage } from '../pages/brand-admin/ShiftsRostersPage';
import { ApprovalsPage as BrandApprovalsPage } from '../pages/brand-admin/ApprovalsPage';
import { SettingsPage as BrandAdminSettingsPage } from '../pages/brand-admin/SettingsPage';
import { EssDashboard } from '../pages/ess/EssDashboard';
import { MyAttendancePage } from '../pages/ess/MyAttendancePage';
import { LeaveBalancePage } from '../pages/ess/LeaveBalancePage';
import { MyLeavePage } from '../pages/ess/MyLeavePage';
import { TeamApprovalsPage } from '../pages/ess/TeamApprovalsPage';
import { MyOdPage } from '../pages/ess/MyOdPage';
import { MyCompOffPage } from '../pages/ess/MyCompOffPage';
import { MyPayslipsPage } from '../pages/ess/MyPayslipsPage';
import { HolidaysPage as EssHolidaysPage } from '../pages/ess/HolidaysPage';
import { MyProfilePage } from '../pages/ess/MyProfilePage';
import { DocumentVerificationPage } from '../pages/ess/DocumentVerificationPage';
import { SettingsPage as EssSettingsPage } from '../pages/ess/SettingsPage';
import {
  BRAND_ADMIN_NAV,
  COMPANY_ADMIN_NAV,
  ESS_NAV,
  GROUP_ADMIN_NAV,
  SUPER_ADMIN_NAV,
} from './navConfig';
import { useAuth } from '../context/auth-context';

export function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Fullscreen kiosk view, deliberately outside ProtectedRoute/Layout —
          it does its own login gate and has no use for portal chrome. */}
      <Route path="/kiosk" element={<KioskPage />} />
      <Route path="/activate" element={<ActivatePage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route
        path="/super-admin"
        element={
          <ProtectedRoute>
            <Layout navItems={SUPER_ADMIN_NAV} portalLabel="Super Admin" title="Dashboard">
              <SuperAdminDashboard />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/super-admin/companies"
        element={
          <ProtectedRoute permission="group:read">
            <Layout navItems={SUPER_ADMIN_NAV} portalLabel="Super Admin" title="Companies">
              <CompaniesPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/super-admin/companies/:id"
        element={
          <ProtectedRoute permission="company:read">
            <Layout navItems={SUPER_ADMIN_NAV} portalLabel="Super Admin" title="Company Detail">
              <CompanyDetailPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/super-admin/groups/:id"
        element={
          <ProtectedRoute permission="group:read">
            <Layout navItems={SUPER_ADMIN_NAV} portalLabel="Super Admin" title="Group Detail">
              <GroupDetailPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/super-admin/users"
        element={
          <ProtectedRoute permission="employee:read">
            <Layout navItems={SUPER_ADMIN_NAV} portalLabel="Super Admin" title="Users">
              <UsersPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/super-admin/settings"
        element={
          <ProtectedRoute>
            <Layout navItems={SUPER_ADMIN_NAV} portalLabel="Super Admin" title="Settings">
              <SuperAdminSettingsPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/company-admin"
        element={
          <ProtectedRoute>
            <Layout navItems={COMPANY_ADMIN_NAV} portalLabel="Company Admin" title="Dashboard">
              <CompanyAdminDashboard />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/company-admin/employees"
        element={
          <ProtectedRoute permission="employee:read">
            <Layout navItems={COMPANY_ADMIN_NAV} portalLabel="Company Admin" title="Employees">
              <EmployeesPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/company-admin/organization"
        element={
          <ProtectedRoute permission="department:read">
            <Layout navItems={COMPANY_ADMIN_NAV} portalLabel="Company Admin" title="Organization">
              <CompanyAdminOrganizationPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/company-admin/shifts-rosters"
        element={
          <ProtectedRoute permission="shift:read">
            <Layout navItems={COMPANY_ADMIN_NAV} portalLabel="Company Admin" title="Shifts">
              <ShiftsRostersPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/company-admin/approvals"
        element={
          <ProtectedRoute permission="leave_request:read">
            <Layout navItems={COMPANY_ADMIN_NAV} portalLabel="Company Admin" title="Approvals">
              <ApprovalsPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/company-admin/attendance-records"
        element={
          <ProtectedRoute permission="attendance:read">
            <Layout navItems={COMPANY_ADMIN_NAV} portalLabel="Company Admin" title="Attendance Records">
              <CompanyAdminAttendanceRecordsPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/company-admin/attendance-board"
        element={
          <ProtectedRoute permission="attendance:read">
            <Layout navItems={COMPANY_ADMIN_NAV} portalLabel="Company Admin" title="Attendance Board">
              <CompanyAdminAttendanceBoardPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/company-admin/fraud-attempts"
        element={
          <ProtectedRoute permission="attendance:read">
            <Layout navItems={COMPANY_ADMIN_NAV} portalLabel="Company Admin" title="Fraud Attempts">
              <FraudAttemptsPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/company-admin/scanner-accounts"
        element={
          <ProtectedRoute permission="scanner_account:create">
            <Layout navItems={COMPANY_ADMIN_NAV} portalLabel="Company Admin" title="Kiosk Accounts">
              <CompanyAdminScannerAccountsPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/company-admin/holidays"
        element={
          <ProtectedRoute permission="holiday:read">
            <Layout navItems={COMPANY_ADMIN_NAV} portalLabel="Company Admin" title="Holidays">
              <CompanyAdminHolidaysPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/company-admin/roster-groups"
        element={
          <ProtectedRoute permission="roster_group:read">
            <Layout navItems={COMPANY_ADMIN_NAV} portalLabel="Company Admin" title="Roster">
              <CompanyAdminRosterGroupsPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/company-admin/leave-policies"
        element={
          <ProtectedRoute permission="leave_policy:read">
            <Layout navItems={COMPANY_ADMIN_NAV} portalLabel="Company Admin" title="Leave Policy Settings">
              <CompanyAdminLeavePolicySettingsPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/company-admin/policies"
        element={
          <ProtectedRoute permission="company_policy:read">
            <Layout navItems={COMPANY_ADMIN_NAV} portalLabel="Company Admin" title="Company Policies">
              <CompanyAdminPoliciesPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/company-admin/payroll"
        element={
          <ProtectedRoute permission="payroll_settings:read">
            <Layout navItems={COMPANY_ADMIN_NAV} portalLabel="Company Admin" title="Payroll">
              <PayrollPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/company-admin/provide-leaves"
        element={
          <ProtectedRoute permission="leave_balance:adjust">
            <Layout navItems={COMPANY_ADMIN_NAV} portalLabel="Company Admin" title="Provide Leaves">
              <CompanyAdminProvideLeavesPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/company-admin/settings"
        element={
          <ProtectedRoute permission="company:read">
            <Layout navItems={COMPANY_ADMIN_NAV} portalLabel="Company Admin" title="Settings">
              <CompanyAdminSettingsPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/group-admin"
        element={
          <ProtectedRoute>
            <Layout navItems={GROUP_ADMIN_NAV} portalLabel="Group Admin" title="Dashboard">
              <GroupAdminDashboard />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/group-admin/companies"
        element={
          <ProtectedRoute permission="company:read">
            <Layout navItems={GROUP_ADMIN_NAV} portalLabel="Group Admin" title="Companies">
              <GroupCompaniesPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/group-admin/companies/:id"
        element={
          <ProtectedRoute permission="company:read">
            <Layout navItems={GROUP_ADMIN_NAV} portalLabel="Group Admin" title="Company Detail">
              <GroupCompanyDetailPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/group-admin/settings"
        element={
          <ProtectedRoute>
            <Layout navItems={GROUP_ADMIN_NAV} portalLabel="Group Admin" title="Settings">
              <GroupAdminSettingsPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/brand-admin"
        element={
          <ProtectedRoute>
            <Layout navItems={BRAND_ADMIN_NAV} portalLabel="Brand Admin" title="Dashboard">
              <BrandAdminDashboard />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/brand-admin/employees"
        element={
          <ProtectedRoute permission="employee:read">
            <Layout navItems={BRAND_ADMIN_NAV} portalLabel="Brand Admin" title="Employees">
              <BrandEmployeesPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/brand-admin/organization"
        element={
          <ProtectedRoute permission="department:read">
            <Layout navItems={BRAND_ADMIN_NAV} portalLabel="Brand Admin" title="Organization">
              <BrandAdminOrganizationPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/brand-admin/shifts-rosters"
        element={
          <ProtectedRoute permission="shift_roster:read">
            <Layout navItems={BRAND_ADMIN_NAV} portalLabel="Brand Admin" title="Shifts">
              <BrandShiftsRostersPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/brand-admin/approvals"
        element={
          <ProtectedRoute permission="leave_request:read">
            <Layout navItems={BRAND_ADMIN_NAV} portalLabel="Brand Admin" title="Approvals">
              <BrandApprovalsPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/brand-admin/attendance-records"
        element={
          <ProtectedRoute permission="attendance:read">
            <Layout navItems={BRAND_ADMIN_NAV} portalLabel="Brand Admin" title="Attendance Records">
              <BrandAdminAttendanceRecordsPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/brand-admin/attendance-board"
        element={
          <ProtectedRoute permission="attendance:read">
            <Layout navItems={BRAND_ADMIN_NAV} portalLabel="Brand Admin" title="Attendance Board">
              <BrandAdminAttendanceBoardPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/brand-admin/scanner-accounts"
        element={
          <ProtectedRoute permission="scanner_account:create">
            <Layout navItems={BRAND_ADMIN_NAV} portalLabel="Brand Admin" title="Kiosk Accounts">
              <BrandAdminScannerAccountsPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/brand-admin/holidays"
        element={
          <ProtectedRoute permission="holiday:read">
            <Layout navItems={BRAND_ADMIN_NAV} portalLabel="Brand Admin" title="Holidays">
              <BrandAdminHolidaysPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/brand-admin/roster-groups"
        element={
          <ProtectedRoute permission="roster_group:read">
            <Layout navItems={BRAND_ADMIN_NAV} portalLabel="Brand Admin" title="Roster">
              <BrandAdminRosterGroupsPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/brand-admin/policies"
        element={
          <ProtectedRoute permission="company_policy:read">
            <Layout navItems={BRAND_ADMIN_NAV} portalLabel="Brand Admin" title="Company Policies">
              <BrandAdminPoliciesPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/brand-admin/settings"
        element={
          <ProtectedRoute>
            <Layout navItems={BRAND_ADMIN_NAV} portalLabel="Brand Admin" title="Settings">
              <BrandAdminSettingsPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/ess"
        element={
          <ProtectedRoute>
            <Layout navItems={ESS_NAV} portalLabel="Employee Self-Service" title="Dashboard">
              <EssDashboard />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/ess/attendance"
        element={
          <ProtectedRoute permission="attendance:read_own">
            <Layout navItems={ESS_NAV} portalLabel="Employee Self-Service" title="My Attendance">
              <MyAttendancePage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/ess/leave-balance"
        element={
          <ProtectedRoute permission="leave_balance:read_own">
            <Layout navItems={ESS_NAV} portalLabel="Employee Self-Service" title="Leave Balance">
              <LeaveBalancePage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/ess/leave"
        element={
          <ProtectedRoute permission="leave_request:read_own">
            <Layout navItems={ESS_NAV} portalLabel="Employee Self-Service" title="My Leave">
              <MyLeavePage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/ess/team-approvals"
        element={
          <ProtectedRoute permission="leave_request:read_reports">
            <Layout navItems={ESS_NAV} portalLabel="Employee Self-Service" title="Team Approvals">
              <TeamApprovalsPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/ess/od"
        element={
          <ProtectedRoute permission="od_request:read_own">
            <Layout navItems={ESS_NAV} portalLabel="Employee Self-Service" title="My OD">
              <MyOdPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/ess/comp-off"
        element={
          <ProtectedRoute permission="comp_off:read_own">
            <Layout navItems={ESS_NAV} portalLabel="Employee Self-Service" title="My Comp-Off">
              <MyCompOffPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/ess/payslips"
        element={
          <ProtectedRoute permission="payslip:read_own">
            <Layout navItems={ESS_NAV} portalLabel="Employee Self-Service" title="My Payslips">
              <MyPayslipsPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/ess/holidays"
        element={
          <ProtectedRoute permission="holiday:read">
            <Layout navItems={ESS_NAV} portalLabel="Employee Self-Service" title="Yearly Holidays">
              <EssHolidaysPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/ess/policies"
        element={
          <ProtectedRoute permission="company_policy:read">
            <Layout navItems={ESS_NAV} portalLabel="Employee Self-Service" title="Company Policies">
              <EssPoliciesPage extraParams={{ rosterGroupId: user?.rosterGroupId ?? undefined }} />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/ess/provide-leaves"
        element={
          <ProtectedRoute permission="leave_balance:adjust">
            <Layout navItems={ESS_NAV} portalLabel="Employee Self-Service" title="Provide Leaves">
              <EssProvideLeavesPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/ess/document-verification"
        element={
          <ProtectedRoute permission="employee_document:verify">
            <Layout navItems={ESS_NAV} portalLabel="Employee Self-Service" title="Document Verification">
              <DocumentVerificationPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/ess/profile"
        element={
          <ProtectedRoute permission="employee:read_own">
            <Layout navItems={ESS_NAV} portalLabel="Employee Self-Service" title="My Profile">
              <MyProfilePage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/ess/settings"
        element={
          <ProtectedRoute>
            <Layout navItems={ESS_NAV} portalLabel="Employee Self-Service" title="Settings">
              <EssSettingsPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
