'use strict';

const service = require('./attendance.service');
const { parsePagination } = require('../../utils/pagination');

async function list(req, res, next) {
  try {
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

module.exports = { list, get, videoUrl };
