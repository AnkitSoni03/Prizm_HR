'use strict';

const React = require('react');
const { Document, Page, View, Text, StyleSheet, renderToBuffer } = require('@react-pdf/renderer');

const e = React.createElement;

// The formal payslip (shared with the employee by a payroll manager) — the
// full salary structure (earnings split, deductions, employer contributions,
// PF passbook) for one month. The built-in Helvetica only has Latin-1-ish
// glyphs (no ₹, no arrows), so every text goes through pdfText().

const COLORS = {
  primary: '#3354a4',
  primaryLight: 'rgba(51, 84, 164, 0.08)',
  border: '#d9dee6',
  ink: '#1f2937',
  inkMuted: '#6b7280',
  soft: '#f7f8fa',
};

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9.5, color: COLORS.ink, fontFamily: 'Helvetica' },
  companyName: { fontSize: 16, fontWeight: 700, color: COLORS.primary },
  companySub: { fontSize: 9, color: COLORS.inkMuted, marginTop: 2 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 },
  title: { fontSize: 12, fontWeight: 700 },
  revised: { fontSize: 8, color: COLORS.inkMuted },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTop: `1px solid ${COLORS.border}`,
    borderBottom: `1px solid ${COLORS.border}`,
    paddingVertical: 6,
    marginTop: 10,
  },
  infoCell: { width: '33.33%', paddingVertical: 3 },
  label: { fontSize: 7.5, color: COLORS.inkMuted, textTransform: 'uppercase' },
  value: { fontSize: 9.5, marginTop: 1 },
  daysRow: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: COLORS.soft, borderRadius: 6, paddingVertical: 7, marginTop: 10 },
  daysCell: { alignItems: 'center' },
  columns: { flexDirection: 'row', marginTop: 12 },
  column: { flex: 1 },
  columnGap: { width: 16 },
  sectionTitle: { fontSize: 8.5, fontWeight: 700, color: COLORS.inkMuted, textTransform: 'uppercase', marginBottom: 4 },
  tableHead: { flexDirection: 'row', borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 3, marginBottom: 2 },
  row: { flexDirection: 'row', paddingVertical: 2 },
  cellName: { flex: 1 },
  cellAmount: { width: 62, textAlign: 'right' },
  muted: { color: COLORS.inkMuted, fontSize: 7.5 },
  final: { fontSize: 9, color: '#b42318', marginTop: 4, fontWeight: 700 },
  totalRow: { flexDirection: 'row', borderTop: `1px solid ${COLORS.border}`, marginTop: 2, paddingTop: 3 },
  bold: { fontWeight: 700 },
  netPayBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primaryLight,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginTop: 14,
  },
  netPayLabel: { fontSize: 12, fontWeight: 700, color: COLORS.primary },
  section: { marginTop: 14 },
  box: { backgroundColor: COLORS.soft, borderRadius: 6, padding: 8 },
  footnote: { fontSize: 7.5, color: COLORS.inkMuted, marginTop: 4 },
});

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Characters the built-in font can't draw are swapped for plain ones.
function pdfText(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/₹\s*/g, 'Rs. ')
    .replace(/[→⇒➜]/g, 'to')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/×/g, 'x')
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '');
}

function dmy(date) {
  if (!date) return '';
  const [y, m, d] = String(date).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function rs(value) {
  return `Rs. ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function info(label, value) {
  return e(View, { style: styles.infoCell }, e(Text, { style: styles.label }, label), e(Text, { style: styles.value }, pdfText(value) || '-'));
}

// `inColumn` = one of the two side-by-side tables (flex: 1 in a row); a
// full-width table must not get flex: 1 — inside a column box it collapses
// to zero height and its rows overlap whatever comes next.
function table(title, rows, total, { showFull = true, inColumn = true } = {}) {
  return e(
    View,
    { style: inColumn ? styles.column : null },
    title ? e(Text, { style: styles.sectionTitle }, title) : null,
    e(
      View,
      { style: styles.tableHead },
      e(Text, { style: [styles.cellName, styles.muted] }, 'Component'),
      showFull && e(Text, { style: [styles.cellAmount, styles.muted] }, 'Monthly'),
      e(Text, { style: [styles.cellAmount, styles.muted] }, 'This month')
    ),
    ...rows.map((r, i) =>
      e(
        View,
        { key: `${r.key}-${i}`, style: styles.row },
        e(View, { style: styles.cellName }, e(Text, null, pdfText(r.name)), r.rule ? e(Text, { style: styles.muted }, pdfText(r.rule)) : null),
        showFull && e(Text, { style: styles.cellAmount }, r.full === undefined ? '' : rs(r.full)),
        e(Text, { style: styles.cellAmount }, rs(r.amount))
      )
    ),
    e(
      View,
      { style: styles.totalRow },
      e(Text, { style: [styles.cellName, styles.bold] }, pdfText(total.label)),
      showFull && e(Text, { style: [styles.cellAmount, styles.bold] }, total.full === undefined ? '' : rs(total.full)),
      e(Text, { style: [styles.cellAmount, styles.bold] }, rs(total.amount))
    )
  );
}

function buildDocument(payroll) {
  const d = payroll.details || {};
  const employee = payroll.employee || {};
  const company = employee.company || {};
  const period = `${MONTH_NAMES[payroll.periodMonth - 1]} ${payroll.periodYear}`;
  const carries = d.carries || [];
  const deductions = [...(d.deductions || [])];
  const salaryNet = (d.actual && d.actual.inHand) || 0;
  const pf = d.pfSplit && d.pfSplit.actual;
  // Days before joining / after the last working day: not paid, not LOP.
  const notOnPayroll = Math.max(0, Number(payroll.monthDays) - Number(payroll.paidDays) - Number(payroll.lopDays));
  const dayCell = (label, value) =>
    e(View, { style: styles.daysCell }, e(Text, { style: styles.label }, label), e(Text, { style: styles.value }, String(value)));

  return e(
    Document,
    null,
    e(
      Page,
      { size: 'A4', style: styles.page },
      e(Text, { style: styles.companyName }, pdfText(company.name || d.companyName || '')),
      company.legalName && company.legalName !== company.name ? e(Text, { style: styles.companySub }, pdfText(company.legalName)) : null,
      e(
        View,
        { style: styles.titleRow },
        e(Text, { style: styles.title }, `Payslip for ${period}`),
        payroll.revisedAt
          ? e(Text, { style: styles.revised }, `Revised on ${new Date(payroll.revisedAt).toLocaleDateString('en-IN')}`)
          : null
      ),
      payroll.isFinal
        ? e(Text, { style: styles.final }, `Final settlement - salary paid up to ${dmy(payroll.finalDate)} (last working day)`)
        : null,
      e(
        View,
        { style: styles.infoGrid },
        info('Employee', employee.name),
        info('Employee code', employee.employeeCode),
        info('Designation', employee.designation && employee.designation.title),
        info('Department', employee.department && employee.department.name),
        info('Brand', employee.brand && employee.brand.name),
        info('Monthly CTC', rs(payroll.monthlyCtc))
      ),
      e(
        View,
        { style: styles.daysRow },
        dayCell('Days in month', payroll.monthDays),
        dayCell('Paid days', payroll.paidDays),
        dayCell('Loss of pay days', payroll.lopDays),
        notOnPayroll > 0 ? dayCell(payroll.isFinal ? 'After last day / before joining' : 'Not on payroll', notOnPayroll) : null
      ),
      e(
        View,
        { style: styles.columns },
        table('Earnings', [...(d.earnings || []), ...(d.bonuses || []).map((b) => ({ ...b, rule: 'One-time, this month' }))], {
          label: (d.bonuses || []).length > 0 ? 'Total earnings' : 'Gross salary',
          full: d.full && d.full.grossSalary,
          amount: (Number(payroll.grossEarned) || 0) + (Number(payroll.bonusTotal) || 0),
        }),
        e(View, { style: styles.columnGap }),
        table(
          'Deductions',
          deductions.length > 0 ? deductions : [{ key: 'none', name: 'No deductions', amount: 0 }],
          { label: 'Total deductions', full: d.full && d.full.totalDeductions, amount: payroll.totalDeductions }
        )
      ),
      carries.length > 0
        ? e(
          View,
          { style: styles.section },
          e(Text, { style: styles.sectionTitle }, 'Adjustments from earlier months'),
          e(
            View,
            { style: styles.box },
            ...carries.map((c) =>
              e(
                View,
                { key: c.id, style: styles.row },
                e(Text, { style: styles.cellName }, `${c.amount >= 0 ? 'Arrears' : 'Recovery'} for ${MONTH_NAMES[c.sourceMonth - 1]} ${c.sourceYear}`),
                e(Text, { style: styles.cellAmount }, `${c.amount >= 0 ? '+' : '-'}${rs(Math.abs(c.amount))}`)
              )
            ),
            e(Text, { style: styles.footnote }, `Salary for this month after deductions: ${rs(salaryNet)}`)
          )
        )
        : null,
      e(
        View,
        { style: styles.netPayBox },
        e(Text, { style: styles.netPayLabel }, 'Net pay (in-hand)'),
        e(Text, { style: styles.netPayLabel }, rs(payroll.netPay))
      ),
      (d.employer || []).length > 0
        ? e(
          View,
          { style: styles.section },
          e(Text, { style: styles.sectionTitle }, 'Employer contributions (part of CTC, not paid as salary)'),
          e(
            View,
            { style: styles.box },
            table('', d.employer, { label: 'Total employer share', full: d.full && d.full.totalEmployer, amount: payroll.totalEmployer }, { inColumn: false })
          )
        )
        : null,
      pf
        ? e(
          View,
          { style: styles.section },
          e(Text, { style: styles.sectionTitle }, 'PF account credit (as in the EPF passbook)'),
          e(
            View,
            { style: styles.box },
            e(View, { style: styles.row }, e(Text, { style: styles.cellName }, 'Employee share to EPF'), e(Text, { style: styles.cellAmount }, rs(pf.employeeEpf))),
            e(View, { style: styles.row }, e(Text, { style: styles.cellName }, 'Employer share to EPF'), e(Text, { style: styles.cellAmount }, rs(pf.employerEpf))),
            e(View, { style: styles.row }, e(Text, { style: styles.cellName }, `Employer share to EPS pension (${d.pfSplit.epsRate}%)`), e(Text, { style: styles.cellAmount }, rs(pf.eps))),
            e(
              View,
              { style: styles.totalRow },
              e(Text, { style: [styles.cellName, styles.bold] }, 'Total PF contribution'),
              e(Text, { style: [styles.cellAmount, styles.bold] }, rs(pf.employeeEpf + pf.employerEpf + pf.eps))
            )
          )
        )
        : null,
      e(Text, { style: [styles.footnote, { marginTop: 16 }] }, 'This is a computer-generated payslip and does not need a signature.')
    )
  );
}

async function buildPayslipPdfBuffer(payroll) {
  const plain = payroll.get ? payroll.get({ plain: true }) : payroll;
  return renderToBuffer(buildDocument(plain));
}

module.exports = { buildPayslipPdfBuffer };
