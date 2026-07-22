'use strict';

const React = require('react');
const { Document, Page, View, Text, StyleSheet, renderToBuffer } = require('@react-pdf/renderer');

const e = React.createElement;

const COLORS = {
  primary: '#3354a4',
  primaryLight: 'rgba(51, 84, 164, 0.08)',
  border: '#d9dee6',
  ink: '#1f2937',
  inkMuted: '#6b7280',
};

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, color: COLORS.ink, fontFamily: 'Helvetica' },
  header: { marginBottom: 16 },
  companyName: { fontSize: 16, fontWeight: 700, color: COLORS.primary },
  companySub: { fontSize: 9, color: COLORS.inkMuted, marginTop: 2 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  title: { fontSize: 12, fontWeight: 700 },
  status: { fontSize: 9, color: COLORS.inkMuted, textTransform: 'uppercase' },
  employeeBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: `1px solid ${COLORS.border}`,
    borderBottom: `1px solid ${COLORS.border}`,
    paddingVertical: 8,
    marginTop: 12,
  },
  employeeLabel: { fontSize: 8, color: COLORS.inkMuted, textTransform: 'uppercase' },
  employeeValue: { fontSize: 10, marginTop: 2 },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#f7f8fa',
    borderRadius: 6,
    paddingVertical: 8,
    marginTop: 12,
  },
  daysCell: { alignItems: 'center' },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 9, fontWeight: 700, color: COLORS.inkMuted, textTransform: 'uppercase', marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: `1px solid ${COLORS.border}`,
    marginTop: 2,
    paddingTop: 4,
  },
  totalLabel: { fontWeight: 700 },
  totalValue: { fontWeight: 700 },
  netPayBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primaryLight,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginTop: 16,
  },
  netPayLabel: { fontSize: 12, fontWeight: 700, color: COLORS.primary },
  netPayValue: { fontSize: 12, fontWeight: 700, color: COLORS.primary },
  employerBox: { backgroundColor: '#f7f8fa', borderRadius: 6, padding: 8, marginTop: 6 },
  footnote: { fontSize: 8, color: COLORS.inkMuted, marginTop: 6 },
});

function formatAmount(value) {
  return Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function buildDocument(payslip) {
  const company = payslip.company;
  const employee = payslip.employee;
  const run = payslip.payrollRun;
  const components = payslip.components || [];

  const earnings = components.filter((c) => c.category === 'earning' || c.category === 'reimbursement');
  const deductions = components.filter((c) => c.category === 'deduction');
  const employerContributions = components.filter((c) => c.category === 'employer_contribution');

  const periodLabel = run ? `${MONTH_NAMES[run.periodMonth - 1]} ${run.periodYear}` : '—';

  const rows = (items, prefix = '') =>
    items.map((c) =>
      e(
        View,
        { key: c.id, style: styles.row },
        e(Text, null, c.name),
        e(Text, null, `${prefix}${formatAmount(c.amount)}`)
      )
    );

  return e(
    Document,
    null,
    e(
      Page,
      { size: 'A4', style: styles.page },
      e(
        View,
        { style: styles.header },
        e(Text, { style: styles.companyName }, company?.name ?? ''),
        company?.legalName && e(Text, { style: styles.companySub }, company.legalName),
        company?.gstNumber && e(Text, { style: styles.companySub }, `GSTIN: ${company.gstNumber}`),
        e(
          View,
          { style: styles.titleRow },
          e(Text, { style: styles.title }, `Payslip for ${periodLabel}`),
          run && e(Text, { style: styles.status }, run.status)
        )
      ),
      e(
        View,
        { style: styles.employeeBlock },
        e(
          View,
          null,
          e(Text, { style: styles.employeeLabel }, 'Employee'),
          e(Text, { style: styles.employeeValue }, `${employee?.name ?? ''} (${employee?.employeeCode ?? ''})`)
        ),
        e(
          View,
          null,
          e(Text, { style: styles.employeeLabel }, 'Designation'),
          e(Text, { style: styles.employeeValue }, employee?.designation?.title ?? '—')
        ),
        e(
          View,
          null,
          e(Text, { style: styles.employeeLabel }, 'Department'),
          e(Text, { style: styles.employeeValue }, employee?.department?.name ?? '—')
        )
      ),
      e(
        View,
        { style: styles.daysRow },
        e(View, { style: styles.daysCell }, e(Text, { style: styles.employeeLabel }, 'Working Days'), e(Text, { style: styles.employeeValue }, String(payslip.workingDays))),
        e(View, { style: styles.daysCell }, e(Text, { style: styles.employeeLabel }, 'LOP Days'), e(Text, { style: styles.employeeValue }, String(payslip.lopDays))),
        e(View, { style: styles.daysCell }, e(Text, { style: styles.employeeLabel }, 'Payable Days'), e(Text, { style: styles.employeeValue }, String(payslip.payableDays)))
      ),
      e(
        View,
        { style: styles.section },
        e(Text, { style: styles.sectionTitle }, 'Earnings'),
        ...rows(earnings),
        e(
          View,
          { style: styles.totalRow },
          e(Text, { style: styles.totalLabel }, 'Gross Earnings'),
          e(Text, { style: styles.totalValue }, formatAmount(payslip.grossEarnings))
        )
      ),
      deductions.length > 0 &&
        e(
          View,
          { style: styles.section },
          e(Text, { style: styles.sectionTitle }, 'Deductions'),
          ...rows(deductions, '−'),
          e(
            View,
            { style: styles.totalRow },
            e(Text, { style: styles.totalLabel }, 'Total Deductions'),
            e(Text, { style: styles.totalValue }, `−${formatAmount(payslip.totalDeductions)}`)
          )
        ),
      e(
        View,
        { style: styles.netPayBox },
        e(Text, { style: styles.netPayLabel }, 'Net Pay'),
        e(Text, { style: styles.netPayValue }, formatAmount(payslip.netPay))
      ),
      employerContributions.length > 0 &&
        e(
          View,
          { style: styles.section },
          e(Text, { style: styles.sectionTitle }, 'Employer Contributions'),
          e(View, { style: styles.employerBox }, ...rows(employerContributions)),
          e(
            Text,
            { style: styles.footnote },
            'Paid by the company on top of your salary — does not affect your net pay.'
          )
        )
    )
  );
}

async function buildPayslipPdfBuffer(payslip) {
  return renderToBuffer(buildDocument(payslip));
}

module.exports = { buildPayslipPdfBuffer };
