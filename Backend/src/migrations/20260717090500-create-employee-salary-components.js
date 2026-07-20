'use strict';

// Line items of a structure, snapshotted at assignment time from
// salary_component_definitions — calculation_type/value are copies, not
// live references, so editing the catalog later never retroactively changes
// an already-assigned structure. resolved_amount is the computed *monthly
// full-pay* amount cached at assignment time (from annual_ctc / percentage
// chain resolution) — distinct from payslip_components.amount, which
// re-prorates this per run for LOP.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('employee_salary_components', {
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
      salary_structure_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'employee_salary_structures', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      component_definition_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'salary_component_definitions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      calculation_type: {
        type: Sequelize.ENUM('fixed_amount', 'percentage_of_component', 'formula'),
        allowNull: false,
      },
      value: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      resolved_amount: {
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

    await queryInterface.addIndex('employee_salary_components', ['salary_structure_id'], {
      name: 'employee_salary_components_structure_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('employee_salary_components');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_employee_salary_components_calculation_type";');
  },
};
