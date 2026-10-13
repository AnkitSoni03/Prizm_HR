'use strict';

// Extra deductions / employer contributions a Group Admin defines once for
// the whole Group (e.g. "Canteen", "Loan EMI"). Every template sees every
// active item and can switch it on/off or override its value (template
// rules.customItems); every employee assignment can switch it off too.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payroll_custom_items', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
      group_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'groups', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      name: { type: Sequelize.STRING, allowNull: false },
      kind: { type: Sequelize.ENUM('deduction', 'employer_contribution'), allowNull: false },
      calc_type: { type: Sequelize.ENUM('percent', 'fixed'), allowNull: false },
      // Only for calc_type 'percent'.
      basis: { type: Sequelize.ENUM('basic', 'gross', 'ctc'), allowNull: true },
      value: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_by_user_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('payroll_custom_items', ['group_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payroll_custom_items');
  },
};
