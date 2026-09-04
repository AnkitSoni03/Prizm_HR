'use strict';

// Lets an employee have more than one manager — previously employees.manager_id
// was a single self-referencing FK ("the" manager). That column keeps working
// exactly as before (it's manager #1 / the primary manager); this table holds
// any ADDITIONAL managers. See utils/managerScope.js::getManagersForEmployee,
// the one place that unions manager_id + this table into the full manager set
// the multi-manager leave-approval workflow (leave_request_approvals) uses.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('employee_managers', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      company_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      employee_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      manager_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      deleted_at: {
        allowNull: true,
        type: Sequelize.DATE,
      },
    });

    // Partial unique index (paranoid-safe — same pattern as
    // 20260717090400's active-salary-structure index) so the same manager
    // can be re-added after being removed without a dead soft-deleted row
    // blocking it.
    await queryInterface.addIndex('employee_managers', ['employee_id', 'manager_id'], {
      unique: true,
      name: 'employee_managers_employee_id_manager_id_active_idx',
      where: { deleted_at: null },
    });

    // One-time backfill: every employee who already had a manager_id gets a
    // matching row here, so the new multi-manager set is never a regression
    // for existing data — it's the exact same single manager, just also
    // reachable through the new table.
    await queryInterface.sequelize.query(`
      INSERT INTO employee_managers (company_id, employee_id, manager_id, created_at, updated_at)
      SELECT company_id, id, manager_id, NOW(), NOW()
      FROM employees
      WHERE manager_id IS NOT NULL AND deleted_at IS NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('employee_managers');
  },
};
