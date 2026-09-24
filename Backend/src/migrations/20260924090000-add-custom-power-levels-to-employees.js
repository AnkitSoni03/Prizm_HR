'use strict';

const { DataTypes } = require('sequelize');

// Per-power scope for an employee's hand-picked "powers" (see
// config/powerCatalog.js and employee.service.js::assignEmployeePowers),
// e.g. { "approve_requests": "brand", "run_payroll": "company" }. Values
// are 'brand' | 'company' | 'group'. Null means "no levels recorded" —
// readers fall back to treating whatever the employee's customRole grants
// as company level, which is what every power meant before levels existed.
module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('employees', 'custom_power_levels', {
      type: DataTypes.JSONB,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('employees', 'custom_power_levels');
  },
};
