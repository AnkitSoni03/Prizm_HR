'use strict';

// Payroll is now managed at three levels (modules/payroll/payrollAccess.js):
// Group, Company (all its Brands) and Brand. A salary template / extra item
// belongs to the level that made it:
//   company_id NULL                  — Group-level (every company of the Group)
//   company_id set, brand_id NULL    — that Company and all its Brands
//   company_id set, brand_id set     — that Brand only
// Every existing row stays Group-level (both NULL). Names are unique per
// owner, not per Group, so two companies can each have a "Standard".
const TABLES = ['payroll_templates', 'payroll_custom_items'];

module.exports = {
  async up(queryInterface, Sequelize) {
    for (const table of TABLES) {
      await queryInterface.addColumn(table, 'company_id', {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      });
      await queryInterface.addColumn(table, 'brand_id', {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'brands', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      });
      await queryInterface.addIndex(table, ['company_id']);
      await queryInterface.addIndex(table, ['brand_id']);
    }
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS payroll_templates_group_name_unique;');
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX payroll_templates_owner_name_unique ON payroll_templates ' +
        '(group_id, COALESCE(company_id, 0), COALESCE(brand_id, 0), lower(name)) WHERE deleted_at IS NULL;'
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS payroll_templates_owner_name_unique;');
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX payroll_templates_group_name_unique ON payroll_templates (group_id, lower(name)) WHERE deleted_at IS NULL;'
    );
    for (const table of TABLES) {
      await queryInterface.removeColumn(table, 'brand_id');
      await queryInterface.removeColumn(table, 'company_id');
    }
  },
};
