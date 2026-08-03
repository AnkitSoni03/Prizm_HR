'use strict';

// Face-recognition attendance replaces the QR+WebAuthn kiosk flow — one row
// per employee holds their 3 self-registered angle embeddings (128-float
// arrays each), used for 1:N matching at kiosk check-in/out
// (faceAttendance.service.js). company_id per CLAUDE.md rule 1 (every
// business table carries it), even though matching is scoped through it via
// a direct column here rather than joining Employee, since the kiosk-side
// cache load (faceCache.js) needs to filter by company without a join.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('employee_face_profiles', {
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
      employee_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      embedding_front: {
        type: Sequelize.JSONB,
        allowNull: false,
      },
      embedding_left: {
        type: Sequelize.JSONB,
        allowNull: false,
      },
      embedding_right: {
        type: Sequelize.JSONB,
        allowNull: false,
      },
      photo_object_path_front: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      photo_object_path_left: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      photo_object_path_right: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('active', 'revoked'),
        allowNull: false,
        defaultValue: 'active',
      },
      registered_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      last_matched_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
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

    // Partial unique index — same pattern as
    // 20260717090400-add-active-structure-unique-index-to-employee-salary-structures.js.
    // Defense-in-depth: faceProfile.service.js always updates the existing
    // row in place (restoring a soft-deleted one via paranoid:false lookup)
    // rather than insert-after-delete, so this index backs up the service
    // check rather than being the primary mechanism.
    await queryInterface.addIndex('employee_face_profiles', ['employee_id'], {
      unique: true,
      name: 'employee_face_profiles_one_active_per_employee',
      where: { status: 'active' },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('employee_face_profiles');
  },
};
