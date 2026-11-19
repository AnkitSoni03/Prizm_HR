'use strict';

const db = require('../../models');
const { POWER_CATALOG, isCompanyLimitable } = require('../../config/powerCatalog');
const { allowedLevelsForCaller, callerKind } = require('../../utils/powerAuthority');
const { runAsCompany } = require('../../config/tenant-context');

// Each power carries `levels` (what it can ever be granted at),
// `allowedLevels` (what THIS caller may grant — see utils/powerAuthority.js)
// and `companyLimitable` (Group level can be cut down to chosen companies),
// so the assignment UI can disable what the server would reject anyway.
async function list(req, res, next) {
  try {
    const data = [];
    for (const power of POWER_CATALOG) {
      // eslint-disable-next-line no-await-in-loop
      const allowedLevels = await allowedLevelsForCaller(req.auth, power);
      data.push({ ...power, allowedLevels, companyLimitable: isCompanyLimitable(power) });
    }
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

// GET /powers/companies?employeeId= — the companies of that employee's Group,
// for choosing which ones a Group-level power covers. Only the callers who
// can grant Group level (Super Admin, Group Admin of that Group) get them.
async function groupCompanies(req, res, next) {
  try {
    const kind = callerKind(req.auth);
    if (kind !== 'super_admin' && kind !== 'group_admin') {
      return res.status(403).json({ error: 'Only a Group Admin or Super Admin can choose companies' });
    }
    if (!/^\d+$/.test(String(req.query.employeeId || ''))) {
      return res.status(400).json({ error: 'employeeId is required' });
    }
    const data = await runAsCompany(null, async () => {
      const employee = await db.Employee.findByPk(req.query.employeeId, { attributes: ['id', 'companyId'] });
      if (!employee) return null;
      const company = await db.Company.findByPk(employee.companyId, { attributes: ['id', 'groupId'] });
      if (!company || !company.groupId) return [];
      if (kind === 'group_admin' && String(company.groupId) !== String(req.auth.groupId)) return null;
      const companies = await db.Company.findAll({
        where: { groupId: company.groupId },
        attributes: ['id', 'name', 'status'],
        order: [['name', 'ASC']],
      });
      return companies.map((c) => ({
        id: String(c.id),
        name: c.name,
        status: c.status,
        isEmployeeCompany: String(c.id) === String(employee.companyId),
      }));
    });
    if (data === null) return res.status(404).json({ error: 'Employee not found' });
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, groupCompanies };

// GET /powers/brands?employeeId= — the brands of that employee's company,
// for choosing which ones a Company-level power covers. Group Admin / Super
// Admin (employee in their Group), or a company-scoped admin for an employee
// of their own company (not while acting in a sibling company).
async function companyBrands(req, res, next) {
  try {
    const kind = callerKind(req.auth);
    if (kind === 'acting') return res.status(403).json({ error: 'Powers can only be assigned from your own company' });
    if (!/^\d+$/.test(String(req.query.employeeId || ''))) {
      return res.status(400).json({ error: 'employeeId is required' });
    }
    const data = await runAsCompany(null, async () => {
      const employee = await db.Employee.findByPk(req.query.employeeId, { attributes: ['id', 'companyId', 'brandId'] });
      if (!employee) return null;
      if (kind === 'company' && String(employee.companyId) !== String(req.auth.companyId)) return null;
      if (kind === 'group_admin') {
        const company = await db.Company.findByPk(employee.companyId, { attributes: ['id', 'groupId'] });
        if (!company || String(company.groupId) !== String(req.auth.groupId)) return null;
      }
      const brands = await db.Brand.findAll({
        where: { companyId: employee.companyId },
        attributes: ['id', 'name', 'isActive'],
        order: [['name', 'ASC']],
      });
      return brands.map((b) => ({
        id: String(b.id),
        name: b.name,
        isActive: b.isActive !== false,
        isEmployeeBrand: String(b.id) === String(employee.brandId),
      }));
    });
    if (data === null) return res.status(404).json({ error: 'Employee not found' });
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
}

module.exports.companyBrands = companyBrands;
