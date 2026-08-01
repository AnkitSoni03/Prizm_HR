'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class DocumentUploadRequest extends Model {
    static associate(models) {
      DocumentUploadRequest.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      DocumentUploadRequest.belongsTo(models.User, { foreignKey: 'requestedByUserId', as: 'requestedBy' });
    }
  }

  DocumentUploadRequest.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      requestedByUserId: { type: DataTypes.BIGINT, allowNull: true },
      documentType: { type: DataTypes.STRING, allowNull: false },
      note: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.ENUM('pending', 'fulfilled', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
    },
    {
      sequelize,
      modelName: 'DocumentUploadRequest',
      tableName: 'document_upload_requests',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(DocumentUploadRequest);

  return DocumentUploadRequest;
};
