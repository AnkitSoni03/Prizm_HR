import { useState } from 'react';
import axios from 'axios';
import { Download, FileBarChart } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/auth-context';
import { ReportEmployeePicker, type PickedEmployee } from '../../components/reports/ReportEmployeePicker';
import { ReportMonthPicker } from '../../components/reports/ReportMonthPicker';
import { EmployeePeriodReportView } from '../../components/reports/EmployeePeriodReportView';
import { MonthlyReportDetail } from '../../components/reports/MonthlyReportDetail';
import { exportEmployeePeriodReport, getEmployeePeriodReport, type EmployeePeriodReport } from '../../api/employeeReports';
import { exportEmployeeMonthlyReport } from '../../api/employeeMonthlyReport';

// Monthly Report (sidebar) — pick one or many employees and any months, get
// one combined report on screen and as one .xlsx. Exactly one employee +
// one month shows the detailed day-by-day report instead. Shared by Company
// Admin, Brand Admin and Group Admin (not Super Admin — the backend refuses it).

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') return err.response.data.error;
  return fallback;
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

type Result =
  | { kind: 'detail'; employeeId: string; year: number; month: number }
  | { kind: 'combined'; report: EmployeePeriodReport };

export function EmployeeReportsPage() {
  const { user } = useAuth();
  const isGroupAdmin = !!user?.roles.some((role) => role.name === 'Group Admin');

  const [selected, setSelected] = useState<Map<string, PickedEmployee>>(new Map());
  const [months, setMonths] = useState<string[]>(() => [currentMonthKey()]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const canRun = selected.size > 0 && months.length > 0;
  const sortedMonths = [...months].sort();
  const isSingle = selected.size === 1 && months.length === 1;

  async function handleGenerate() {
    setError(null);
    if (isSingle) {
      const [y, m] = sortedMonths[0].split('-').map(Number);
      setResult({ kind: 'detail', employeeId: [...selected.keys()][0], year: y, month: m });
      return;
    }
    setIsLoading(true);
    try {
      const report = await getEmployeePeriodReport({ employeeIds: [...selected.keys()], months: sortedMonths });
      setResult({ kind: 'combined', report });
    } catch (err) {
      setResult(null);
      setError(extractError(err, 'Could not generate the report.'));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleExport() {
    setIsExporting(true);
    setError(null);
    try {
      if (isSingle) {
        const [y, m] = sortedMonths[0].split('-').map(Number);
        const picked = [...selected.values()][0];
        const blob = await exportEmployeeMonthlyReport(picked.id, y, m);
        const code = (picked.employeeCode ?? picked.id).replace(/[^A-Za-z0-9_-]/g, '-');
        downloadBlob(`monthly-report-${code}-${sortedMonths[0]}.xlsx`, blob);
      } else {
        const blob = await exportEmployeePeriodReport({ employeeIds: [...selected.keys()], months: sortedMonths });
        const first = sortedMonths[0];
        const last = sortedMonths[sortedMonths.length - 1];
        downloadBlob(`monthly-report-${first === last ? first : `${first}-to-${last}`}.xlsx`, blob);
      }
    } catch (err) {
      setError(extractError(err, 'Could not export the report.'));
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
        <div className="mb-4 flex items-center gap-2">
          <FileBarChart className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-base font-semibold text-ink">Monthly Report</h2>
            <p className="text-xs text-ink-muted">
              Attendance, payable / LOP days, working hours, leave, OD, regularizations and comp-off — for one or many
              employees, in one report.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-ink">1. Employees</p>
            <ReportEmployeePicker isGroupAdmin={isGroupAdmin} selected={selected} onChange={setSelected} />
          </div>
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium text-ink">2. Months</p>
              <ReportMonthPicker value={months} onChange={setMonths} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleGenerate} isLoading={isLoading} disabled={!canRun}>
                Generate Report
              </Button>
              <Button variant="secondary" onClick={handleExport} isLoading={isExporting} disabled={!canRun}>
                <Download className="h-4 w-4" />
                Export (.xlsx)
              </Button>
            </div>
            {selected.size === 0 && <p className="text-xs text-ink-muted">Select at least one employee.</p>}
            {error && <p className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
          </div>
        </div>
      </div>

      {result && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
          {result.kind === 'detail' ? (
            <MonthlyReportDetail employeeId={result.employeeId} year={result.year} month={result.month} />
          ) : (
            <EmployeePeriodReportView report={result.report} />
          )}
        </div>
      )}
    </div>
  );
}
