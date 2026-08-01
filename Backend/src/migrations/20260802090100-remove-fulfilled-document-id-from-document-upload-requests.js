'use strict';

// Document requests are now closed out by the employee's own explicit
// "Done" acknowledgment (documentUploadRequest.service.js::completeRequest),
// not by auto-linking to whichever EmployeeDocument upload happens to
// follow — this column was added for that earlier, now-replaced approach
// and was never populated by any shipped code path.
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeColumn('document_upload_requests', 'fulfilled_document_id');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('document_upload_requests', 'fulfilled_document_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'employee_documents', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },
};
