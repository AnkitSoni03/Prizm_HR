'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { runAsCompany } = require('../../config/tenant-context');
const { getGroupCompanyIds } = require('../../utils/managerScope');
const { isCompanyInactive } = require('../../utils/companyStatus');

// Backs the Employee form's "Manager" picker: an admin first picks one of
// their Group's Companies/Brands, then an employee from it — a manager may
// sit in any company of the Group (see utils/managerScope.js). Brand and
// Employee are tenant-scoped, so these reads run with the hook off and pin
// the Group's company ids explicitly; nothing outside the Group is reachable.

// The caller's Group's companies (active ones), each with its active Brands.
async function listManagerCompanies({ companyId }) {
  const companyIds = await getGroupCompanyIds(companyId);
  if (companyIds.length === 0) return [];

  return runAsCompany(null, async () => {
    const companies = await db.Company.findAll({
      where: { id: { [Op.in]: companyIds } },
      attributes: ['id', 'name', 'status', 'usesBrands'],
      order: [['name', 'ASC']],
    });
    const brands = await db.Brand.findAll({
      where: { companyId: { [Op.in]: companyIds }, isActive: true },
      attributes: ['id', 'name', 'companyId'],
      order: [['name', 'ASC']],
    });
    return companies
      .filter((company) => !isCompanyInactive(company.status))
      .map((company) => ({
        id: company.id,
        name: company.name,
        usesBrands: company.usesBrands,
        isOwnCompany: String(company.id) === String(companyId),
        brands: company.usesBrands
          ? brands
              .filter((brand) => String(brand.companyId) === String(company.id))
              .map((brand) => ({ id: brand.id, name: brand.name }))
          : [],
      }));
  });
}

const OPTION_ATTRIBUTES = ['id', 'name', 'employeeCode', 'companyId', 'brandId'];
const OPTION_INCLUDE = [
  { model: db.Company, as: 'company', attributes: ['id', 'name'] },
  { model: db.Brand, as: 'brand', attributes: ['id', 'name'] },
];

// Employees of one Group company (optionally one Brand — `brandId: 'none'`
// means the company-level employees with no Brand), or — with `ids` — the
// specific employees named (to label already-selected managers). Exited/
// archived/deactivated employees are left out of browsing, but still
// resolvable by id so an existing selection keeps its label.
async function listManagerEmployees({ companyId, targetCompanyId, brandId, search, ids }) {
  const companyIds = await getGroupCompanyIds(companyId);
  if (companyIds.length === 0) return [];

  const where = { companyId: { [Op.in]: companyIds } };
  if (ids && ids.length > 0) {
    where.id = { [Op.in]: ids };
  } else {
    if (!targetCompanyId) throw new HttpError(400, 'companyId is required');
    if (!companyIds.includes(String(targetCompanyId))) throw new HttpError(403, 'Company is not in your group');
    where.companyId = targetCompanyId;
    if (brandId === 'none') where.brandId = null;
    else if (brandId) where.brandId = brandId;
    where.isActive = true;
    where.status = { [Op.notIn]: ['exited', 'archived'] };
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      where[Op.or] = [{ name: { [Op.iLike]: term } }, { employeeCode: { [Op.iLike]: term } }];
    }
  }

  return runAsCompany(null, () =>
    db.Employee.findAll({
      where,
      attributes: OPTION_ATTRIBUTES,
      include: OPTION_INCLUDE,
      order: [['name', 'ASC']],
      limit: 500,
    })
  );
}

module.exports = { listManagerCompanies, listManagerEmployees };
