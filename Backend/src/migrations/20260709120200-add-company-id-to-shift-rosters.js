'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // shift_rosters previously had no company_id of its own — tenancy was
    // derived solely by joining brand_id -> brands.company_id. Brand-optional
    // rosters (company.uses_brands = false) have no brand row to join through,
    // so company_id must be stored directly.
    await queryInterface.addColumn('shift_rosters', 'company_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'companies', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    // Backfill every existing row (all currently brand-scoped) from its
    // brand's company_id before the column is locked to NOT NULL.
    await queryInterface.sequelize.query(`
      UPDATE shift_rosters
      SET company_id = brands.company_id
      FROM brands
      WHERE shift_rosters.brand_id = brands.id
    `);

    await queryInterface.changeColumn('shift_rosters', 'company_id', {
      type: Sequelize.BIGINT,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    // brand_id becomes optional: a company-level roster (company.uses_brands
    // = false, or a brand-mode company's company-wide slot) has brand_id null.
    //
    // Raw SQL, not queryInterface.changeColumn({ allowNull: true, references
    // }) — on this Sequelize/pg combination, changeColumn silently drops the
    // allowNull change whenever `references` is present in the same call
    // (verified against live schema: the column stayed NOT NULL even though
    // the migration completed without error). DROP NOT NULL directly is
    // unambiguous.
    await queryInterface.sequelize.query('ALTER TABLE shift_rosters ALTER COLUMN brand_id DROP NOT NULL');

    await queryInterface.addIndex('shift_rosters', ['company_id'], {
      name: 'shift_rosters_company_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('shift_rosters', 'shift_rosters_company_id_idx');
    await queryInterface.sequelize.query('ALTER TABLE shift_rosters ALTER COLUMN brand_id SET NOT NULL');
    await queryInterface.removeColumn('shift_rosters', 'company_id');
  },
};
