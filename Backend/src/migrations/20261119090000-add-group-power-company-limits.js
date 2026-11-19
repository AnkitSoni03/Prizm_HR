'use strict';

const { DataTypes } = require('sequelize');

// Powers limited to chosen companies (Group level) or chosen brands
// (Company level).
//   employees.custom_power_brands — { powerKey: [brandId, ...] } for each
//     Company-level power limited to some brands of the employee's company
//     (one brand-scoped UserRole per chosen brand); absent = every brand.
//
// Group-level powers limited to chosen companies of the Group.
//   employees.custom_power_companies — { powerKey: [companyId, ...] } for each
//     Group-level power limited to some companies; a power not listed here
//     (or a null column) covers every company of the Group, as before.
//   user_roles.allowed_company_ids — the same list on the actual grant
//     (JSON array of numbers); NULL = no limit. Only ever set on an
//     employee's per-power "Custom Powers – <id> (group:<key>)" grant, so
//     every existing row stays NULL and nothing changes for it.
module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('employees', 'custom_power_companies', {
      type: DataTypes.JSONB,
      allowNull: true,
    });
    await queryInterface.addColumn('employees', 'custom_power_brands', {
      type: DataTypes.JSONB,
      allowNull: true,
    });
    await queryInterface.addColumn('user_roles', 'allowed_company_ids', {
      type: DataTypes.JSONB,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('user_roles', 'allowed_company_ids');
    await queryInterface.removeColumn('employees', 'custom_power_brands');
    await queryInterface.removeColumn('employees', 'custom_power_companies');
  },
};
