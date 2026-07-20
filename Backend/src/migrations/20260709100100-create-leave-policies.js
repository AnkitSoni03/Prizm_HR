'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('leave_policies', {
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
      leave_type_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'leave_types', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      annual_quota: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
      },
      accrual: {
        type: Sequelize.ENUM('yearly', 'monthly'),
        allowNull: false,
        defaultValue: 'yearly',
      },
      applicable_after_days: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
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

    // One active policy per leave type per company — the accrual/eligibility
    // logic always looks up a single policy row for (companyId, leaveTypeId).
    await queryInterface.addIndex('leave_policies', ['company_id', 'leave_type_id'], {
      unique: true,
      name: 'leave_policies_company_id_leave_type_id_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('leave_policies');
  },
};
