'use strict';

const { DataTypes } = require('sequelize');

// attendance.checkout_missed: the employee checked in but never checked out
// within the 12h30m checkout window (utils/shiftTime.js). Deliberately a
// flag, not a new `status` value — the day stays 'present' so payroll keeps
// counting it until a regularization corrects the times.
//
// Also backfills shifts.is_night_shift from the shift's own hours: the shift
// form always sent `false`, so every overnight shift created so far was
// stored (and shown) as a day shift.
module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('attendance', 'checkout_missed', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.sequelize.query(
      `UPDATE attendance
          SET checkout_missed = true
        WHERE check_in IS NOT NULL
          AND check_out IS NULL
          AND check_in < NOW() - INTERVAL '12 hours 30 minutes'
          AND deleted_at IS NULL`
    );

    await queryInterface.sequelize.query(
      `UPDATE shifts
          SET is_night_shift = (end_time <= start_time)
        WHERE start_time IS NOT NULL
          AND end_time IS NOT NULL`
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('attendance', 'checkout_missed');
  },
};
