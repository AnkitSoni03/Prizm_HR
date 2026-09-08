'use strict';

// Removes the local anti-spoof model's shadow-mode toggle and its
// "Fraud Attempts" review table — both were built entirely around
// antiSpoof.service.js/screenArtifact.service.js's own confidence scores,
// which no longer exist now that AWS Face Liveness owns this decision
// (faceAttendance.service.js). AWS's pass/fail is authoritative; there is
// no more "flag but allow, let an admin review" middle state.
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeColumn('companies', 'face_antispoof_enforced');
    await queryInterface.dropTable('face_verification_flags');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('companies', 'face_antispoof_enforced', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.createTable('face_verification_flags', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      company_id: { type: Sequelize.BIGINT, allowNull: false },
      kiosk_user_id: { type: Sequelize.BIGINT, allowNull: false },
      action: { type: Sequelize.ENUM('checkin', 'checkout'), allowNull: false },
      employee_id: { type: Sequelize.BIGINT, allowNull: true },
      attendance_id: { type: Sequelize.BIGINT, allowNull: true },
      reason: { type: Sequelize.ENUM('anti_spoof_model', 'screen_artifact'), allowNull: false },
      blocked: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      real_logit: { type: Sequelize.FLOAT, allowNull: true },
      spoof_logit: { type: Sequelize.FLOAT, allowNull: true },
      anti_spoof_confidence: { type: Sequelize.FLOAT, allowNull: true },
      screen_artifact_score: { type: Sequelize.FLOAT, allowNull: true },
      video_object_path: { type: Sequelize.STRING, allowNull: true },
      reviewed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      reviewed_by_user_id: { type: Sequelize.BIGINT, allowNull: true },
      reviewed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });
  },
};
