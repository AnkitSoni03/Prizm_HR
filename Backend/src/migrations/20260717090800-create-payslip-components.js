'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payslip_components', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      payslip_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'payslips', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      // Nullable + SET NULL: the definition may be renamed/deactivated/
      // deleted later, but category/name below are snapshotted so the
      // payslip line item survives that intact regardless.
      component_definition_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'salary_component_definitions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      category: {
        type: Sequelize.ENUM('earning', 'deduction', 'reimbursement'),
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
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

    await queryInterface.addIndex('payslip_components', ['payslip_id'], {
      name: 'payslip_components_payslip_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payslip_components');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_payslip_components_category";');
  },
};
