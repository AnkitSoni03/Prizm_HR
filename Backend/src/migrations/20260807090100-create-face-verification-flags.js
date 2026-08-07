'use strict';

// Records a suspicious kiosk face-attendance attempt for admin review — the
// video-fraud-detection audit trail requested alongside the anti-spoof
// model itself. Decoupled from the `attendance` table on purpose: a
// blocked attempt (spoof detected, enforcement on) never creates an
// attendance row at all, so this is the only place its evidence can live.
// A soft-flagged attempt (enforcement off, or a real-face-but-suspicious
// screen-artifact score) DOES still produce a normal attendance row —
// attendance_id links back to it for cross-reference, video stays on the
// attendance record itself (unchanged upload path), not duplicated here.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('face_verification_flags', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      company_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
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
      action: {
        type: Sequelize.ENUM('checkin', 'checkout'),
        allowNull: false,
      },
      // Best-effort face-match guess even on a blocked/spoof attempt — the
      // embedding match still runs (read-only) so admin can see who the
      // attempt was impersonating, not just that it was rejected.
      employee_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      // Set only when the attempt was allowed through anyway (enforcement
      // off, or a non-blocking screen-artifact-only flag) — null when
      // blocked, since no attendance row exists in that case.
      attendance_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'attendance', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      reason: {
        type: Sequelize.ENUM('anti_spoof_model', 'screen_artifact'),
        allowNull: false,
      },
      // true = check-in was actually rejected (companies.face_antispoof_enforced
      // was on at the time); false = allowed through, flagged for review only.
      blocked: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      real_logit: { type: Sequelize.FLOAT, allowNull: true },
      spoof_logit: { type: Sequelize.FLOAT, allowNull: true },
      anti_spoof_confidence: { type: Sequelize.FLOAT, allowNull: true },
      // Uncalibrated heuristic score (0-1ish) — informational only, never
      // the sole reason for a `blocked: true` row today.
      screen_artifact_score: { type: Sequelize.FLOAT, allowNull: true },
      // GCS object path for the capture clip — only populated for a blocked
      // attempt (the kiosk uploads it against this flag's id, since there's
      // no attendance_id to attach it to; see faceFlag.routes.js).
      video_object_path: { type: Sequelize.STRING, allowNull: true },
      reviewed: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      reviewed_by_user_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      reviewed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      deleted_at: {
        allowNull: true,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.addIndex('face_verification_flags', ['company_id', 'created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('face_verification_flags');
  },
};
