'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('qr_attendance_terminals', {
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
      brand_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'brands', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      terminal_code: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      secret_key: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      rotation_seconds: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 8,
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
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

    await queryInterface.addIndex('qr_attendance_terminals', ['company_id', 'terminal_code'], {
      unique: true,
      name: 'qr_attendance_terminals_company_id_terminal_code_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('qr_attendance_terminals');
  },
};
