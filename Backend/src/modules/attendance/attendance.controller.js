'use strict';

const service = require('./attendance.service');
const { parsePagination } = require('../../utils/pagination');
const { writeAttendanceBoardXlsx } = require('../../utils/attendanceBoardExport');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { assertCompanyInCallerGroup } = require('../../utils/resolveCompanyScope');

// Which company (or companies) an admin attendance view covers. A
// company-scoped caller is always pinned to their own company (any
// ?companyId= is ignored). Group Admin is company-less: ?companyId= drills
// into one of their Group's companies (verified to be in the Group), and
// omitting it means "every company in my Group" — the group-wide
// one-dashboard view. Super Admin must name a company. Returns either a
// single id or an array; the service passes it straight into a Sequelize
// `companyId` where, which treats an array as IN (...).
async function resolveAttendanceCompanyScope(req) {
  if (req.auth.companyId) return req.auth.companyId;
  const requested = req.query.companyId || null;
  if (req.auth.groupId) {
    if (requested) {
      await assertCompanyInCallerGroup({ groupId: req.auth.groupId, companyId: requested });
      return requested;
    }
    const companies = await db.Company.findAll({ where: { groupId: req.auth.groupId }, attributes: ['id'] });
    return companies.map((c) => c.id);
  }
  if (!requested) throw new HttpError(400, 'companyId is required');
  return requested;
}

async function list(req, res, next) {
  try {
    // Own-scoped ESS history: return every day in the range (gaps filled
    // with holiday/weekoff/leave/absent), not just days with a punch, all
    // on one page rather than paginated. Company Admin's multi-employee
    // list (below) is untouched.
    if (req.attendanceEmployeeScope && req.query.from && req.query.to) {
      const { rows } = await service.listMyAttendanceHistory({
        companyId: req.auth.companyId,
        employeeId: req.attendanceEmployeeScope,
        from: req.query.from,
        to: req.query.to,
      });
      res.json({ data: rows, pagination: { total: rows.length, limit: rows.length, offset: 0 } });
      return;
    }

    const { limit, offset } = parsePagination(req.query);
    const { rows, count } = await service.listAttendance({
      companyId: req.auth.companyId,
      employeeId: req.attendanceEmployeeScope || req.query.employeeId,
      brandId: req.query.brandId,
      from: req.query.from,
      to: req.query.to,
      limit,
      offset,
    });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function roster(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    // req.auth.scopedBrandIds (a brand-scoped caller, e.g. Brand Admin)
    // always wins — an explicit ?brandId= only ever lets a COMPANY-WIDE
    // caller (Company Admin/HR Manager, scopedBrandIds null) narrow their
    // otherwise-unfiltered view down to one Brand.
    const requestedBrandId = req.query.brandId || null;
    const brandIds = req.auth.scopedBrandIds ?? (requestedBrandId ? [requestedBrandId] : null);
    const { rows, count } = await service.listAttendanceRoster({
      companyId: await resolveAttendanceCompanyScope(req),
      brandIds,
      date: req.query.date,
      search: req.query.search,
      status: req.query.status,
      leaveTypeId: req.query.leaveTypeId,
      limit,
      offset,
    });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

// req.auth.scopedBrandIds (a brand-scoped caller, e.g. Brand Admin) always
// wins — an explicit ?brandId= only ever lets a COMPANY-WIDE caller
// (Company Admin/HR Manager, scopedBrandIds null) narrow their otherwise-
// unfiltered view down to one Brand. Same pattern as roster() above.
function resolveBoardBrandIds(req) {
  const requestedBrandId = req.query.brandId || null;
  return req.auth.scopedBrandIds ?? (requestedBrandId ? [requestedBrandId] : null);
}

async function board(req, res, next) {
  try {
    const result = await service.listAttendanceBoard({
      companyId: await resolveAttendanceCompanyScope(req),
      brandIds: resolveBoardBrandIds(req),
      year: req.query.year,
      month: req.query.month,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function exportBoard(req, res, next) {
  try {
    const result = await service.listAttendanceBoard({
      companyId: await resolveAttendanceCompanyScope(req),
      brandIds: resolveBoardBrandIds(req),
      year: req.query.year,
      month: req.query.month,
    });
    await writeAttendanceBoardXlsx(res, result);
  } catch (err) {
    next(err);
  }
}

async function bulkUpdateStatus(req, res, next) {
  try {
    const result = await service.bulkSetAttendanceStatus({
      companyId: req.auth.companyId,
      brandIds: req.auth.scopedBrandIds,
      employeeIds: req.body.employeeIds,
      date: req.body.date,
      status: req.body.status,
      leaveTypeId: req.body.leaveTypeId,
      actorUserId: req.auth.userId,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const attendance = await service.getAttendanceForRead({
      companyId: req.auth.companyId,
      id: req.params.id,
      scopedEmployeeId: req.attendanceEmployeeScope,
    });
    res.json({ data: attendance });
  } catch (err) {
    next(err);
  }
}

async function videoUrl(req, res, next) {
  try {
    const result = await service.getAttendanceVideoUrl({
      companyId: await resolveAttendanceCompanyScope(req),
      id: req.params.id,
      scopedEmployeeId: req.attendanceEmployeeScope,
      type: req.query.type,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, videoUrl, roster, board, exportBoard, bulkUpdateStatus };
