'use strict';

module.exports = {
  async up(queryInterface) {
    // Brand-optional operation: a company with companies.uses_brands = false
    // creates employees with brand_id = null. FK/onUpdate/onDelete are
    // untouched — only the NOT NULL constraint is lifted.
    //
    // Raw SQL, not queryInterface.changeColumn({ allowNull: true, references
    // }) — on this Sequelize/pg combination, changeColumn silently drops the
    // allowNull change whenever `references` is present in the same call
    // (verified against live schema: the column stayed NOT NULL even though
    // the migration completed without error). DROP NOT NULL directly is
    // unambiguous.
    await queryInterface.sequelize.query('ALTER TABLE employees ALTER COLUMN brand_id DROP NOT NULL');
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE employees ALTER COLUMN brand_id SET NOT NULL');
  },
};
