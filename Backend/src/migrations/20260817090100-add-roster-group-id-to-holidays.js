'use strict';

// Second independent scoping dimension on Holiday, alongside brand_id — lets
// a Roster Group (e.g. "Kolkata") carry region-specific holidays (extra
// Durga Puja days) that only its own employees see, without touching any
// other holiday row. See utils/workingDays.js::isHoliday for the matching
// logic (AND of two independent OR-clauses: brand-wide-or-this-brand AND
// roster-group-wide-or-this-roster-group).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('holidays', 'roster_group_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'roster_groups', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addIndex('holidays', ['company_id', 'roster_group_id', 'date'], {
      name: 'holidays_company_id_roster_group_id_date_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('holidays', 'holidays_company_id_roster_group_id_date_idx');
    await queryInterface.removeColumn('holidays', 'roster_group_id');
  },
};
