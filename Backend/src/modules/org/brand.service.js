'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');

async function listBrands({ companyId, limit, offset }) {
  // For a scoped caller (Company Admin etc.), Brand's tenant-scope hook
  // (src/models/hooks/tenant-scope.js) already injects their own company_id
  // from the request's AsyncLocalStorage context — the explicit companyId
  // filter below only matters for Super Admin (whose context is null, so the
  // hook is a no-op), letting the Super Admin portal scope the list to one
  // Company at a time (e.g. expanding a Company card to show its Brands).
  const where = companyId ? { companyId } : {};

  const { rows, count } = await db.Brand.findAndCountAll({
    where,
    limit,
    offset,
    order: [['id', 'ASC']],
  });
  return { rows, count };
}

async function getBrandForRead(id) {
  const brand = await db.Brand.findOne({ where: { id } });
  if (!brand) throw new HttpError(404, 'Brand not found');
  return brand;
}

// Brand create/update/delete are Super-Admin-only (CLAUDE.md: "Only Super
// Admin creates Groups, Companies, Brands"), and Super Admin's own users row
// has company_id NULL — so writes look up/verify the TARGET company
// explicitly instead of relying on the caller's own tenant context.
async function getBrandForWrite({ callerCompanyId, id }) {
  const brand = await db.Brand.findByPk(id);
  if (!brand) throw new HttpError(404, 'Brand not found');
  if (callerCompanyId !== null && brand.companyId !== callerCompanyId) {
    throw new HttpError(404, 'Brand not found');
  }
  return brand;
}

async function createBrand({ companyId, name, code, address, city, state }) {
  const company = await db.Company.findByPk(companyId);
  if (!company) throw new HttpError(404, 'Company not found');
  if (!company.usesBrands) {
    throw new HttpError(400, 'This company operates directly and does not use Brands');
  }

  return db.Brand.create({ companyId, name, code, address, city, state });
}

async function updateBrand({ callerCompanyId, id, updates }) {
  const brand = await getBrandForWrite({ callerCompanyId, id });
  const { name, code, address, city, state, isActive } = updates;

  await brand.update({
    ...(name !== undefined && { name }),
    ...(code !== undefined && { code }),
    ...(address !== undefined && { address }),
    ...(city !== undefined && { city }),
    ...(state !== undefined && { state }),
    ...(isActive !== undefined && { isActive }),
  });
  return brand;
}

// Mirrors group.service.js's getGroupAdminInvitation. brandId on Invitation
// is only ever set by inviteBrandAdmin (ESS/Company Admin invites always
// leave it null), so no roleId filter is needed here.
async function getBrandAdminInvitation(id) {
  const brand = await db.Brand.findByPk(id);
  if (!brand) throw new HttpError(404, 'Brand not found');

  const invitation = await db.Invitation.findOne({
    where: { brandId: id },
    order: [['createdAt', 'DESC']],
  });
  if (!invitation) return null;

  const user = await db.User.findOne({ where: { companyId: brand.companyId, email: invitation.email } });
  return { email: invitation.email, status: user ? user.status : 'invited' };
}

async function deleteBrand({ callerCompanyId, id }) {
  const brand = await getBrandForWrite({ callerCompanyId, id });

  const activeEmployeeCount = await db.Employee.count({ where: { brandId: id } });
  if (activeEmployeeCount > 0) {
    throw new HttpError(409, `Cannot delete brand: ${activeEmployeeCount} employee(s) still assigned`);
  }

  await brand.destroy();
}

module.exports = {
  listBrands,
  getBrandForRead,
  createBrand,
  updateBrand,
  getBrandAdminInvitation,
  deleteBrand,
};
