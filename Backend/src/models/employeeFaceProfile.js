'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class EmployeeFaceProfile extends Model {
    static associate(models) {
      EmployeeFaceProfile.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      EmployeeFaceProfile.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
    }
  }

  EmployeeFaceProfile.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      // AWS Rekognition's own id for this face, inside this company's
      // collection (utils/rekognition.js::companyCollectionId) — the actual
      // face data/embedding lives entirely on AWS's side now, this is just
      // the pointer back to it.
      rekognitionFaceId: { type: DataTypes.STRING, allowNull: false },
      // GCS object path, audit-only — never sent back to AWS for matching.
      photoObjectPath: { type: DataTypes.STRING, allowNull: true },
      status: {
        type: DataTypes.ENUM('active', 'revoked'),
        allowNull: false,
        defaultValue: 'active',
      },
      registeredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      lastMatchedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'EmployeeFaceProfile',
      tableName: 'employee_face_profiles',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(EmployeeFaceProfile);

  return EmployeeFaceProfile;
};
