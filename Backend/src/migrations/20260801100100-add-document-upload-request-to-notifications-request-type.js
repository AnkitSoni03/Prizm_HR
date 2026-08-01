'use strict';

// Same standalone ALTER TYPE pattern already established for
// 'payroll_run'/'employee_document' — Postgres enum values can't be added
// inside a transaction alongside other DDL, so this stays its own migration.
// Only notifications.request_type is extended; approval_histories.request_type
// is a separate enum and isn't used for this feature.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_notifications_request_type" ADD VALUE IF NOT EXISTS 'document_upload_request';`
    );
  },

  async down() {
    // Postgres has no ALTER TYPE ... DROP VALUE — no-op, same precedent as
    // the other request_type additions.
  },
};
