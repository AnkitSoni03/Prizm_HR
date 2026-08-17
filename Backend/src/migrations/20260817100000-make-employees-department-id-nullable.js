'use strict';

// Super Admin's employee creation now only asks for a name — department
// assignment (like designation, shift, roster group) is Company Admin's job,
// done later via transferEmployee. department_id becomes optional the same
// way brand_id already is (see 20260709120200-add-company-id-to-shift-rosters.js).
//
// Raw SQL, not queryInterface.changeColumn({ allowNull: true, references }) —
// on this Sequelize/pg combination, changeColumn silently drops the allowNull
// change whenever `references` is present in the same call (same quirk noted
// in the brand_id migration above). DROP NOT NULL directly is unambiguous.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE employees ALTER COLUMN department_id DROP NOT NULL');
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE employees ALTER COLUMN department_id SET NOT NULL');
  },
};
