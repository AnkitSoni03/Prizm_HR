'use strict';

// Salary ownership + release requests (modules/payroll/payrollRelease.service.js).
//
// Every salary assignment now records the level that owns it:
//   owner_company_id NULL                  — Group
//   owner_company_id set, owner_brand_id NULL — that Company
//   owner_company_id set, owner_brand_id set  — that Brand
// Only the owner's level (or a level above it) may assign a new salary to the
// employee, correct it or end it. Every existing row stays Group-owned (both
// NULL) — only the Group could assign salaries until now.
//
// payroll_release_requests: a lower level asks the owner to hand an employee
// over (one row per employee). Approving moves the current salary's owner to
// the requester's level; the salary itself keeps running unchanged.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('salary_assignments', 'owner_company_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'companies', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });
    await queryInterface.addColumn('salary_assignments', 'owner_brand_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'brands', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });

    const ref = (model) => ({ references: { model, key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' });
    await queryInterface.createTable('payroll_release_requests', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
      group_id: { type: Sequelize.BIGINT, allowNull: false, ...ref('groups') },
      company_id: { type: Sequelize.BIGINT, allowNull: false, ...ref('companies') },
      employee_id: { type: Sequelize.BIGINT, allowNull: false, ...ref('employees') },
      assignment_id: { type: Sequelize.BIGINT, allowNull: true, references: { model: 'salary_assignments', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      owner_company_id: { type: Sequelize.BIGINT, allowNull: true, ...ref('companies') },
      owner_brand_id: { type: Sequelize.BIGINT, allowNull: true, ...ref('brands') },
      to_company_id: { type: Sequelize.BIGINT, allowNull: false, ...ref('companies') },
      to_brand_id: { type: Sequelize.BIGINT, allowNull: true, ...ref('brands') },
      reason: { type: Sequelize.TEXT, allowNull: true },
      status: { type: Sequelize.ENUM('pending', 'approved', 'rejected', 'cancelled'), allowNull: false, defaultValue: 'pending' },
      requested_by_user_id: { type: Sequelize.BIGINT, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      decided_by_user_id: { type: Sequelize.BIGINT, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      decided_at: { type: Sequelize.DATE, allowNull: true },
      decision_note: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('payroll_release_requests', ['group_id', 'status']);
    await queryInterface.addIndex('payroll_release_requests', ['employee_id']);
    // One open request per employee per requesting level.
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX payroll_release_requests_pending_unique ON payroll_release_requests ' +
        "(employee_id, to_company_id, COALESCE(to_brand_id, 0)) WHERE status = 'pending' AND deleted_at IS NULL;"
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payroll_release_requests');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_payroll_release_requests_status";');
    await queryInterface.removeColumn('salary_assignments', 'owner_brand_id');
    await queryInterface.removeColumn('salary_assignments', 'owner_company_id');
  },
};
