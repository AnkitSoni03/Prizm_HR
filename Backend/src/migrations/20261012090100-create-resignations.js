'use strict';

// Employee resignations (modules/org/resignation.service.js). One pending
// resignation per employee at a time (partial unique index). Decided only by
// the employee's assigned HR (employees.hr_employee_id).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('resignations', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
      company_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      employee_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        // Same as the other per-employee tables: a permanent employee delete
        // (employee.service.js::deleteEmployeePermanently) sweeps these.
        onDelete: 'CASCADE',
      },
      reason: { type: Sequelize.TEXT, allowNull: false },
      requested_last_working_date: { type: Sequelize.DATEONLY, allowNull: true },
      status: {
        type: Sequelize.ENUM('pending', 'accepted', 'rejected', 'withdrawn'),
        allowNull: false,
        defaultValue: 'pending',
      },
      // Set by HR on accept (defaults to the requested date).
      last_working_date: { type: Sequelize.DATEONLY, allowNull: true },
      decision_comment: { type: Sequelize.TEXT, allowNull: true },
      decided_by_user_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      decided_by_employee_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      decided_at: { type: Sequelize.DATE, allowNull: true },
      withdrawn_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.addIndex('resignations', ['company_id', 'status']);
    await queryInterface.addIndex('resignations', ['employee_id']);
    await queryInterface.addIndex('resignations', ['employee_id'], {
      unique: true,
      name: 'resignations_one_pending_per_employee',
      where: { status: 'pending', deleted_at: null },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('resignations');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_resignations_status";');
  },
};
