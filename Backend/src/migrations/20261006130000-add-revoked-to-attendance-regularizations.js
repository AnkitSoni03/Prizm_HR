'use strict';

// Same as 20261006100000 (leave) / ...110000 (OD) / ...120000 (comp-off),
// for attendance regularizations: an admin can revert an approved one
// (attendanceRegularization.service.js::revokeRegularization), which ends up
// 'revoked' with who/why/when on the row.
//
// Unlike leave/OD, approving a regularization OVERWRITES the attendance row
// (status, check-in/out, missed-checkout flag) — nothing recorded what was
// there before. The previous_* columns snapshot those values at approval
// time so a revert can put them back exactly. Regularizations approved
// before this migration have no snapshot (previous_status null) and can't be
// reverted — the day has to be corrected from Attendance Records instead.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_attendance_regularizations_status" ADD VALUE IF NOT EXISTS 'revoked';`
    );
    await queryInterface.addColumn('attendance_regularizations', 'previous_status', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('attendance_regularizations', 'previous_check_in', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('attendance_regularizations', 'previous_check_out', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('attendance_regularizations', 'previous_checkout_missed', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
    });
    await queryInterface.addColumn('attendance_regularizations', 'revoked_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('attendance_regularizations', 'revoked_by_user_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('attendance_regularizations', 'revoke_reason', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    for (const column of [
      'revoke_reason',
      'revoked_by_user_id',
      'revoked_at',
      'previous_checkout_missed',
      'previous_check_out',
      'previous_check_in',
      'previous_status',
    ]) {
      await queryInterface.removeColumn('attendance_regularizations', column);
    }
    // Enum values can't be dropped in Postgres — same as 20260805090100.
  },
};
