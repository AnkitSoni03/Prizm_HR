'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { toBusinessLocal } = require('../../utils/dateRange');

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Buckets employees into the last 6 calendar months (oldest first) by
// dateOfJoining ("joined") and, for status='exited' employees, by updatedAt
// ("exited" — an approximation, since there's no dedicated exit-date column
// yet; the most recent update to an exited employee is assumed to be the
// status change itself).
function buildEmployeeTrend(employees) {
  const now = toBusinessLocal();
  const buckets = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ year: d.getFullYear(), month: d.getMonth(), joined: 0, exited: 0 });
  }
  const bucketFor = (year, month) => buckets.find((b) => b.year === year && b.month === month);

  for (const emp of employees) {
    if (emp.dateOfJoining) {
      const d = new Date(emp.dateOfJoining);
      const bucket = bucketFor(d.getFullYear(), d.getMonth());
      if (bucket) bucket.joined += 1;
    }
    if (emp.status === 'exited' && emp.updatedAt) {
      const d = new Date(emp.updatedAt);
      const bucket = bucketFor(d.getFullYear(), d.getMonth());
      if (bucket) bucket.exited += 1;
    }
  }

  return buckets.map((b) => ({ month: MONTH_LABELS[b.month], joined: b.joined, exited: b.exited }));
}

function buildDepartmentHeadcount(employees) {
  const counts = new Map();
  for (const emp of employees) {
    const name = emp.department ? emp.department.name : 'Unassigned';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

function buildLeaveBreakdown(leaveRequests) {
  const totals = new Map();
  for (const req of leaveRequests) {
    const name = req.leaveType ? req.leaveType.name : 'Other';
    totals.set(name, (totals.get(name) ?? 0) + Number(req.days));
  }
  return Array.from(totals.entries())
    .map(([name, days]) => ({ name, days: Math.round(days * 10) / 10 }))
    .sort((a, b) => b.days - a.days);
}

// LeaveRequest/OdRequest/AttendanceRegularization have no company_id column
// of their own (see their services' listX functions) — scope through the
// Employee association the same way those list endpoints do. brandId is
// optional: omitted for the Company Admin dashboard (whole company), set
// for the Brand Admin dashboard (one brand only — brandCount doesn't apply
// at that scope, so it's reported as 0 rather than the company's total).
async function getDashboardSummary({ companyId, brandId }) {
  const employeeWhere = { companyId };
  if (brandId) employeeWhere.brandId = brandId;

  const startOfYear = new Date(toBusinessLocal().getFullYear(), 0, 1);

  const [
    brandCount,
    employeeCount,
    pendingLeaveRequests,
    pendingOdRequests,
    pendingRegularizations,
    pendingCompOffCredits,
    employeesForCharts,
    leaveRequestsForChart,
  ] = await Promise.all([
    brandId ? Promise.resolve(0) : db.Brand.count({ where: { companyId } }),
    db.Employee.count({ where: employeeWhere }),
    db.LeaveRequest.count({
      where: { status: 'pending' },
      include: [{ model: db.Employee, as: 'employee', where: employeeWhere, attributes: [] }],
    }),
    db.OdRequest.count({
      where: { status: 'pending' },
      include: [{ model: db.Employee, as: 'employee', where: employeeWhere, attributes: [] }],
    }),
    db.AttendanceRegularization.count({
      where: { status: 'pending' },
      include: [{ model: db.Employee, as: 'employee', where: employeeWhere, attributes: [] }],
    }),
    db.CompOffCredit.count({
      where: { status: 'pending_approval' },
      include: [{ model: db.Employee, as: 'employee', where: employeeWhere, attributes: [] }],
    }),
    db.Employee.findAll({
      where: employeeWhere,
      attributes: ['id', 'departmentId', 'dateOfJoining', 'status', 'updatedAt'],
      include: [{ model: db.Department, as: 'department', attributes: ['name'] }],
    }),
    db.LeaveRequest.findAll({
      where: { status: { [Op.in]: ['approved', 'pending'] }, fromDate: { [Op.gte]: startOfYear } },
      attributes: ['id', 'days'],
      include: [
        { model: db.Employee, as: 'employee', where: employeeWhere, attributes: [] },
        { model: db.LeaveType, as: 'leaveType', attributes: ['name'] },
      ],
    }),
  ]);

  return {
    brandCount,
    employeeCount,
    pendingLeaveRequests,
    pendingOdRequests,
    pendingRegularizations,
    pendingCompOffCredits,
    departmentHeadcount: buildDepartmentHeadcount(employeesForCharts),
    employeeTrend: buildEmployeeTrend(employeesForCharts),
    leaveBreakdown: buildLeaveBreakdown(leaveRequestsForChart),
  };
}

// Same 6-bucket shape as buildEmployeeTrend, but counting Companies created
// per month by createdAt — the platform-wide "onboarding pace" the
// EmployeeTrendChart component already knows how to render (reused as-is,
// just fed a single-series `joined`/`exited`-shaped point with `exited`
// always 0 — mirrors that component's own field names rather than adding a
// second chart component for one series).
function buildCompanyTrend(companies) {
  const now = toBusinessLocal();
  const buckets = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ year: d.getFullYear(), month: d.getMonth(), joined: 0, exited: 0 });
  }
  const bucketFor = (year, month) => buckets.find((b) => b.year === year && b.month === month);

  for (const company of companies) {
    const d = new Date(company.createdAt);
    const bucket = bucketFor(d.getFullYear(), d.getMonth());
    if (bucket) bucket.joined += 1;
  }

  return buckets.map((b) => ({ month: MONTH_LABELS[b.month], joined: b.joined, exited: b.exited }));
}

// Platform-wide, unscoped — every Group/Company/Brand/Employee regardless of
// tenant (Super Admin only, gated by requireSuperAdmin at the route level,
// not a permission code — same structural gate CLAUDE.md documents for
// signup-invite). companyStatusBreakdown feeds a status-colored bar (trial/
// active/grace/suspended/terminated), not the categorical palette other
// dashboard charts use — these are literal states, not identity series.
async function getPlatformDashboardSummary() {
  const [groupCount, companyCount, brandCount, employeeCount, companiesByStatus, companiesForTrend] =
    await Promise.all([
      db.Group.count(),
      db.Company.count(),
      db.Brand.count(),
      db.Employee.count(),
      db.Company.findAll({ attributes: ['status', [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']], group: ['status'] }),
      db.Company.findAll({ attributes: ['id', 'createdAt'] }),
    ]);

  const statusCounts = { trial: 0, active: 0, grace: 0, suspended: 0, terminated: 0 };
  for (const row of companiesByStatus) {
    statusCounts[row.status] = Number(row.get('count'));
  }

  return {
    groupCount,
    companyCount,
    brandCount,
    employeeCount,
    companyStatusBreakdown: statusCounts,
    companyTrend: buildCompanyTrend(companiesForTrend),
  };
}

// Group Admin has no companyId of their own (see auth.middleware.js) — this
// aggregates across every Company in their Group instead of a single one.
async function getGroupDashboardSummary({ groupId }) {
  const companies = await db.Company.findAll({ where: { groupId }, attributes: ['id'] });
  const companyIds = companies.map((c) => c.id);

  if (companyIds.length === 0) {
    return { companyCount: 0, employeeCount: 0, pendingLeaveRequests: 0, pendingOdRequests: 0, pendingRegularizations: 0 };
  }

  const employeeWhere = { companyId: { [Op.in]: companyIds } };

  const [employeeCount, pendingLeaveRequests, pendingOdRequests, pendingRegularizations] = await Promise.all([
    db.Employee.count({ where: employeeWhere }),
    db.LeaveRequest.count({
      where: { status: 'pending' },
      include: [{ model: db.Employee, as: 'employee', where: employeeWhere, attributes: [] }],
    }),
    db.OdRequest.count({
      where: { status: 'pending' },
      include: [{ model: db.Employee, as: 'employee', where: employeeWhere, attributes: [] }],
    }),
    db.AttendanceRegularization.count({
      where: { status: 'pending' },
      include: [{ model: db.Employee, as: 'employee', where: employeeWhere, attributes: [] }],
    }),
  ]);

  return {
    companyCount: companyIds.length,
    employeeCount,
    pendingLeaveRequests,
    pendingOdRequests,
    pendingRegularizations,
  };
}

module.exports = { getDashboardSummary, getGroupDashboardSummary, getPlatformDashboardSummary };
