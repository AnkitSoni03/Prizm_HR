'use strict';

const service = require('./attendance.service');
const { parsePagination } = require('../../utils/pagination');

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
    const { rows, count } = await service.listAttendanceRoster({
      companyId: req.auth.companyId,
      brandIds: req.auth.scopedBrandIds,
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
      companyId: req.auth.companyId,
      id: req.params.id,
      scopedEmployeeId: req.attendanceEmployeeScope,
      type: req.query.type,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, videoUrl, roster, bulkUpdateStatus };
