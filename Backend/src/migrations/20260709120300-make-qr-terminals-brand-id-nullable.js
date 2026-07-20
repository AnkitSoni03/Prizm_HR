'use strict';

module.exports = {
  async up(queryInterface) {
    // qr_attendance_terminals already has company_id — only the brand_id
    // NOT NULL constraint needs lifting for company-level terminals (serve
    // every employee in the company regardless of brand; see
    // attendance.service.js::checkIn's terminal/employee brand match).
    //
    // Raw SQL, not queryInterface.changeColumn({ allowNull: true, references
    // }) — on this Sequelize/pg combination, changeColumn silently drops the
    // allowNull change whenever `references` is present in the same call
    // (verified against live schema: the column stayed NOT NULL even though
    // the migration completed without error). DROP NOT NULL directly is
    // unambiguous.
    await queryInterface.sequelize.query('ALTER TABLE qr_attendance_terminals ALTER COLUMN brand_id DROP NOT NULL');
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE qr_attendance_terminals ALTER COLUMN brand_id SET NOT NULL');
  },
};
