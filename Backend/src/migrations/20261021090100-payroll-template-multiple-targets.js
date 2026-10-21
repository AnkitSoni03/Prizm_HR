'use strict';

// A salary template can be made for several companies / brands at once
// (payrollAccess.js template target helpers): payroll_templates.targets =
// [{ companyId, brandId }] — brandId null = that whole company (all its
// brands); NULL / [] = the whole Group. Replaces the single owner columns
// added to payroll_templates in 20261021090000 (backfilled from them).
// Extra items (payroll_custom_items) keep their single company_id/brand_id.
// Names: no longer a DB unique index — two companies may each have their own
// "Standard"; the service rejects a clash among the templates the caller can see.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('payroll_templates', 'targets', { type: Sequelize.JSONB, allowNull: true });
    await queryInterface.sequelize.query(`
      UPDATE payroll_templates
         SET targets = jsonb_build_array(jsonb_build_object(
               'companyId', company_id::text,
               'brandId', CASE WHEN brand_id IS NULL THEN NULL ELSE brand_id::text END))
       WHERE company_id IS NOT NULL;
    `);
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS payroll_templates_owner_name_unique;');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS payroll_templates_group_name_unique;');
    await queryInterface.removeColumn('payroll_templates', 'brand_id');
    await queryInterface.removeColumn('payroll_templates', 'company_id');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('payroll_templates', 'company_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'companies', key: 'id' },
    });
    await queryInterface.addColumn('payroll_templates', 'brand_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'brands', key: 'id' },
    });
    // Only a single-target template maps back; anything wider becomes Group-level.
    await queryInterface.sequelize.query(`
      UPDATE payroll_templates
         SET company_id = (targets->0->>'companyId')::bigint,
             brand_id = NULLIF(targets->0->>'brandId', '')::bigint
       WHERE jsonb_typeof(targets) = 'array' AND jsonb_array_length(targets) = 1;
    `);
    await queryInterface.removeColumn('payroll_templates', 'targets');
  },
};
