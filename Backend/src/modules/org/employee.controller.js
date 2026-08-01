'use strict';

const service = require('./employee.service');
const { parsePagination } = require('../../utils/pagination');
const {
  resolveCompanyScope,
  requireCompanyScope,
  assertCompanyInCallerGroup,
} = require('../../utils/resolveCompanyScope');

async function list(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    // Optional for Super Admin (brandId alone used to be enough to scope
    // the query when every employee had one; a brand-less company's
    // employees need this instead). A company-scoped caller always uses
    // their own companyId.
    const companyId = resolveCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.query.companyId,
    });
    // Group Admin's own companyId is always null (like Super Admin), so
    // nothing above stops them tampering the companyId override to read
    // another Group's employees — verify group membership explicitly.
    await assertCompanyInCallerGroup({ groupId: req.auth.groupId, companyId });
    const { rows, count } = await service.listEmployees({
      limit,
      offset,
      companyId,
      brandId: req.query.brandId,
      departmentId: req.query.departmentId,
      status: req.query.status,
      search: req.query.search,
    });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const employee = await service.getEmployeeForRead(req.params.id);
    res.json({ data: employee });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const {
      name,
      employeeCode,
      brandId,
      departmentId,
      designationId,
      managerId,
      userId,
      dateOfJoining,
      employmentType,
      workState,
    } = req.body;

    // brandId is conditionally required (validated in the service against
    // company.usesBrands) — not every company operates with Brands.
    if (!name || !employeeCode || !departmentId || !employmentType) {
      return res
        .status(400)
        .json({ error: 'name, employeeCode, departmentId and employmentType are required' });
    }
    // A brand-scoped caller (Brand Admin) must target their own brand
    // explicitly — rbac.middleware.js's requirePermission already rejects a
    // *different* brandId, but an omitted one would otherwise fall through
    // to company-level, same shape of gap already fixed for shift_roster.
    if (req.auth.scopedBrandIds && !brandId) {
      return res.status(400).json({ error: 'brandId is required' });
    }

    const companyId = requireCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.body.companyId,
    });

    const employee = await service.createEmployee({
      companyId,
      name,
      employeeCode,
      brandId,
      departmentId,
      designationId,
      managerId,
      userId,
      dateOfJoining,
      employmentType,
      workState,
    });
    res.status(201).json({ data: employee });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const employee = await service.updateEmployee({
      companyId: req.auth.companyId,
      id: req.params.id,
      updates: req.body,
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.json({ data: employee });
  } catch (err) {
    next(err);
  }
}

async function transfer(req, res, next) {
  try {
    const { departmentId } = req.body;
    // brandId: null is a deliberate "un-assign from Brand"; omit the key
    // entirely to leave brand untouched. `'brandId' in req.body` is what
    // distinguishes the two — reading req.body.brandId directly would
    // collapse both to undefined.
    const brandId = 'brandId' in req.body ? req.body.brandId : undefined;
    if (brandId === undefined && !departmentId) {
      return res.status(400).json({ error: 'brandId or departmentId is required' });
    }

    const employee = await service.transferEmployee({
      companyId: req.auth.companyId,
      id: req.params.id,
      brandId,
      departmentId,
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.json({ data: employee });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await service.deleteEmployee({
      companyId: req.auth.companyId,
      id: req.params.id,
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function setActive(req, res, next) {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive (boolean) is required' });
    }

    const employee = await service.setEmployeeActiveStatus({
      companyId: req.auth.companyId,
      id: req.params.id,
      scopedBrandIds: req.auth.scopedBrandIds,
      isActive,
    });
    res.json({ data: employee });
  } catch (err) {
    next(err);
  }
}

async function assignPowers(req, res, next) {
  try {
    const employee = await service.assignEmployeePowers({
      companyId: req.auth.companyId,
      id: req.params.id,
      powerKeys: req.body.powerKeys,
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.json({ data: employee });
  } catch (err) {
    next(err);
  }
}

async function uploadPhoto(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'file is required' });
    }

    const employee = await service.uploadEmployeePhoto({
      companyId: req.auth.companyId,
      id: req.params.id,
      scopedBrandIds: req.auth.scopedBrandIds,
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
    });
    res.json({ data: employee });
  } catch (err) {
    next(err);
  }
}

async function removePhoto(req, res, next) {
  try {
    const employee = await service.removeEmployeePhoto({
      companyId: req.auth.companyId,
      id: req.params.id,
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.json({ data: employee });
  } catch (err) {
    next(err);
  }
}

// Self-service variants — the caller uploads/removes their own photo via
// their own JWT-carried employeeId, no employee:update permission needed
// (mirrors auth.controller.js's change-password: managing your own basic
// profile attribute isn't a resource-scoped RBAC action).
async function uploadMyPhoto(req, res, next) {
  try {
    if (!req.auth.employeeId) {
      return res.status(400).json({ error: 'No employee record linked to this account' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'file is required' });
    }

    const employee = await service.uploadEmployeePhoto({
      companyId: req.auth.companyId,
      id: req.auth.employeeId,
      scopedBrandIds: undefined,
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
    });
    res.json({ data: employee });
  } catch (err) {
    next(err);
  }
}

async function removeMyPhoto(req, res, next) {
  try {
    if (!req.auth.employeeId) {
      return res.status(400).json({ error: 'No employee record linked to this account' });
    }

    const employee = await service.removeEmployeePhoto({
      companyId: req.auth.companyId,
      id: req.auth.employeeId,
      scopedBrandIds: undefined,
    });
    res.json({ data: employee });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  get,
  create,
  update,
  transfer,
  remove,
  setActive,
  assignPowers,
  uploadPhoto,
  removePhoto,
  uploadMyPhoto,
  removeMyPhoto,
};
