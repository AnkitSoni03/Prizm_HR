'use strict';

const { DataTypes } = require('sequelize');

// Optional, admin-set field (same precedent as dateOfBirth/workState — not
// required at creation, filled in by Company Admin/Brand Admin later).
// Drives gender-restricted leave types (see the applicable_gender column
// added to leave_types in the following migration) — e.g. a "Maternity
// Leave" type marked female-only is only offered to/usable by an employee
// whose gender here is 'female'.
module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('employees', 'gender', {
      type: DataTypes.ENUM('male', 'female', 'other'),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('employees', 'gender');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_employees_gender";');
  },
};
