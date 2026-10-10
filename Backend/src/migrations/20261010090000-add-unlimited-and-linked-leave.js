'use strict';

// Two leave features, additive only — every existing row keeps its exact
// prior behavior (all new columns default to false/NULL):
//
//   - leave_policies.is_unlimited: the policy's quota is "Unlimited" instead
//     of a fixed annual_quota — no insufficient-balance rejection, usage is
//     still recorded on leave_balances (balance goes negative, that's fine).
//
//   - leave_types.deduct_from_leave_type_id + deduction_per_use: a "linked"
//     leave type (e.g. Half Day) has no balance of its own — each use charges
//     deduction_per_use (0.5 or 1) day against the source type's balance.
//     NULL = an ordinary independent type with its own quota.
//
//   - leave_requests.half_day_session: 'first_half' / 'second_half' for a
//     0.5-deduction linked type; NULL for every full-day request.
//   - leave_requests.balance_leave_type_id: which leave type's balance this
//     request was actually charged against, snapshotted at submission so an
//     admin later re-pointing a linked type can never make approve/revoke
//     touch a different balance than the one originally checked. NULL =
//     leave_type_id itself (every pre-existing row).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('leave_policies', 'is_unlimited', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('leave_types', 'deduct_from_leave_type_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'leave_types', key: 'id' },
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('leave_types', 'deduction_per_use', {
      type: Sequelize.DECIMAL(3, 2),
      allowNull: true,
    });
    await queryInterface.addColumn('leave_requests', 'half_day_session', {
      type: Sequelize.ENUM('first_half', 'second_half'),
      allowNull: true,
    });
    await queryInterface.addColumn('leave_requests', 'balance_leave_type_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'leave_types', key: 'id' },
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('leave_requests', 'balance_leave_type_id');
    await queryInterface.removeColumn('leave_requests', 'half_day_session');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_leave_requests_half_day_session";');
    await queryInterface.removeColumn('leave_types', 'deduction_per_use');
    await queryInterface.removeColumn('leave_types', 'deduct_from_leave_type_id');
    await queryInterface.removeColumn('leave_policies', 'is_unlimited');
  },
};
