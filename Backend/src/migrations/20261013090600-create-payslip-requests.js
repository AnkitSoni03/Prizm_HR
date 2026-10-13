'use strict';

// An employee asks for the formal payslip of one or more completed months
// (periods: [{ year, month }]). On approval by a Group Admin / group-level
// "Manage Payroll" power holder, those months' employee_payrolls rows get
// payslip_released = true — the employee then sees the full salary structure
// and can download the PDF.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payslip_requests', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
      company_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      group_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'groups', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      employee_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      periods: { type: Sequelize.JSONB, allowNull: false },
      note: { type: Sequelize.TEXT, allowNull: true },
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'rejected', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
      decided_by_user_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      decided_at: { type: Sequelize.DATE, allowNull: true },
      rejection_reason: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('payslip_requests', ['group_id', 'status']);
    await queryInterface.addIndex('payslip_requests', ['employee_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payslip_requests');
  },
};
