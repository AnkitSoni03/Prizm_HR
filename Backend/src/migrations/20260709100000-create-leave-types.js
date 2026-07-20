'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('leave_types', {
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
      code: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      is_paid: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      carry_forward: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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

    // code (CL/SL/EL/CO/LWP...) must be unique per tenant, not globally —
    // same shape as employees.employee_code.
    await queryInterface.addIndex('leave_types', ['company_id', 'code'], {
      unique: true,
      name: 'leave_types_company_id_code_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('leave_types');
  },
};
