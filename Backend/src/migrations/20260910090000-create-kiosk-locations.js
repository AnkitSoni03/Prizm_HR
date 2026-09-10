'use strict';

// A kiosk account is now a GROUP-level machine account (Super Admin only —
// see 20260910100000-seed-super-admin-only-kiosk-accounts.js), and one such
// account is shared by several physical devices sitting in different
// places. Each device claims exactly one of these locations at sign-in so
// two devices can never run as the same physical kiosk.
//
// Deliberately has NO company_id: it belongs to a Group, which spans
// companies, so it must not get the tenant-scope hook every company-scoped
// table has (models/hooks/tenant-scope.js) — see the CLAUDE.md "Known
// gotcha" note about that hook silently zeroing out non-company rows.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('kiosk_locations', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      group_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'groups', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      kiosk_user_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      name: { type: Sequelize.STRING, allowNull: false },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      // The device currently running as this location. A random opaque id
      // minted server-side at claim time and held in that device's own
      // localStorage — NOT the kiosk User id, which is shared by every
      // device using this account and so can't distinguish them.
      active_session_id: { type: Sequelize.STRING, allowNull: true },
      session_claimed_at: { type: Sequelize.DATE, allowNull: true },
      // Refreshed by the kiosk's heartbeat. A claim whose last_seen is older
      // than the staleness window is treated as abandoned (device unplugged,
      // browser killed) and the location becomes selectable again — without
      // this a crashed device would lock its location out forever.
      session_last_seen_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.addIndex('kiosk_locations', ['kiosk_user_id'], { name: 'kiosk_locations_kiosk_user_id_idx' });
    await queryInterface.addIndex('kiosk_locations', ['group_id'], { name: 'kiosk_locations_group_id_idx' });
    // One location name per kiosk account, ignoring soft-deleted rows —
    // same partial-unique-index pattern as employee_salary_structures'
    // active-row index and employee_face_profiles'.
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX kiosk_locations_account_name_unique
         ON kiosk_locations (kiosk_user_id, lower(name))
       WHERE deleted_at IS NULL`
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('kiosk_locations');
  },
};
