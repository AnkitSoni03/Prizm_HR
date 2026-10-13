'use strict';

// Sandwich rule (optional, per salary template — rules.sandwichRule): a
// holiday / week-off with an approved full-day leave on both sides counts as
// leave too. Written at leave approval (modules/payroll/sandwichRule.js), one
// row per sandwiched date. charged_to_balance = one day was taken from the
// leave balance (leave_type_id); is_lop = no balance left (or an unpaid
// leave), so the day is unpaid. Reverting either surrounding leave removes
// the row and refunds the balance.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('leave_sandwich_days', {
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
        onDelete: 'CASCADE',
      },
      date: { type: Sequelize.DATEONLY, allowNull: false },
      leave_type_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'leave_types', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      charged_to_balance: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      is_lop: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      before_leave_request_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'leave_requests', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      after_leave_request_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'leave_requests', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('leave_sandwich_days', ['before_leave_request_id']);
    await queryInterface.addIndex('leave_sandwich_days', ['after_leave_request_id']);
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX leave_sandwich_days_one_per_date ON leave_sandwich_days (employee_id, date) WHERE deleted_at IS NULL;'
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('leave_sandwich_days');
  },
};
