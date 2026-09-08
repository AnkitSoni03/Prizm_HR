'use strict';

// Replaces the local face-api.js embedding storage with a pointer to AWS
// Rekognition's own face record — the actual embedding now lives entirely
// on AWS's side (utils/rekognition.js), inside a per-company Collection.
// Three-angle capture (front/left/right) is also dropped in favor of a
// single photo, since AWS's own IndexFaces quality filter replaces the old
// local front/left/right self-consistency check.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('employee_face_profiles', 'rekognition_face_id', {
      type: Sequelize.STRING,
      allowNull: true, // nothing to backfill this from — see the data step below
    });
    await queryInterface.addColumn('employee_face_profiles', 'photo_object_path', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // The old registration UI never actually sent photoObjectPaths (only
    // embeddings) despite the column existing, so there is no stored photo
    // for any existing row to re-index into AWS from — every existing
    // "active" profile is unusable the moment the embedding columns below
    // are dropped. Flip them to 'revoked' so getMyFaceProfileStatus stops
    // telling those employees they're already registered when the kiosk
    // could never actually match them.
    await queryInterface.sequelize.query(
      "UPDATE employee_face_profiles SET status = 'revoked' WHERE status = 'active'"
    );

    await queryInterface.removeColumn('employee_face_profiles', 'embedding_front');
    await queryInterface.removeColumn('employee_face_profiles', 'embedding_left');
    await queryInterface.removeColumn('employee_face_profiles', 'embedding_right');
    await queryInterface.removeColumn('employee_face_profiles', 'photo_object_path_front');
    await queryInterface.removeColumn('employee_face_profiles', 'photo_object_path_left');
    await queryInterface.removeColumn('employee_face_profiles', 'photo_object_path_right');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('employee_face_profiles', 'embedding_front', { type: Sequelize.JSONB, allowNull: true });
    await queryInterface.addColumn('employee_face_profiles', 'embedding_left', { type: Sequelize.JSONB, allowNull: true });
    await queryInterface.addColumn('employee_face_profiles', 'embedding_right', { type: Sequelize.JSONB, allowNull: true });
    await queryInterface.addColumn('employee_face_profiles', 'photo_object_path_front', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('employee_face_profiles', 'photo_object_path_left', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('employee_face_profiles', 'photo_object_path_right', { type: Sequelize.STRING, allowNull: true });

    await queryInterface.removeColumn('employee_face_profiles', 'rekognition_face_id');
    await queryInterface.removeColumn('employee_face_profiles', 'photo_object_path');
  },
};
