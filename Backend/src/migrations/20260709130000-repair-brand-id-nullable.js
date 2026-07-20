'use strict';

module.exports = {
  // Repairs the live dev DB: migrations 20260709120100/120200/120300 used
  // queryInterface.changeColumn({ allowNull: true, references }) to drop the
  // NOT NULL constraint on brand_id in these three tables. They completed
  // without error and were recorded as applied, but on this Sequelize/pg
  // combination that call silently drops the allowNull change whenever
  // `references` is present in the same call — verified directly against
  // pg_attribute.attnotnull, all three columns were still NOT NULL. Those
  // three migration files were corrected to use raw SQL going forward, but
  // since they're already marked "up" here, this repair migration re-applies
  // the DROP NOT NULL directly so this DB matches what a fresh migrate run
  // would now produce.
  async up(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE employees ALTER COLUMN brand_id DROP NOT NULL');
    await queryInterface.sequelize.query('ALTER TABLE shift_rosters ALTER COLUMN brand_id DROP NOT NULL');
    await queryInterface.sequelize.query('ALTER TABLE qr_attendance_terminals ALTER COLUMN brand_id DROP NOT NULL');
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE employees ALTER COLUMN brand_id SET NOT NULL');
    await queryInterface.sequelize.query('ALTER TABLE shift_rosters ALTER COLUMN brand_id SET NOT NULL');
    await queryInterface.sequelize.query('ALTER TABLE qr_attendance_terminals ALTER COLUMN brand_id SET NOT NULL');
  },
};
