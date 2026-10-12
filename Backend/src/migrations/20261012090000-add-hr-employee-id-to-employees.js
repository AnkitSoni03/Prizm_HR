'use strict';

// The employee's assigned HR person — a plain reference like manager_id. It
// grants nothing on its own; its only effect is that this HR employee (and
// nobody else) may accept/reject THIS employee's resignation (see
// modules/org/resignation.service.js). May point to any company of the same
// Group (enforced in employee.service.js, same as managers).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('employees', 'hr_employee_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'employees', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('employees', 'hr_employee_id');
  },
};
