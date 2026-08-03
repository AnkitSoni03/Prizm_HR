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
      // 128-float descriptors from face-api.js's FaceRecognitionNet, one per
      // registered angle — stored as plain JSON arrays, matched via
      // Euclidean distance in faceAttendance.service.js.
      embeddingFront: { type: DataTypes.JSONB, allowNull: false },
      embeddingLeft: { type: DataTypes.JSONB, allowNull: false },
      embeddingRight: { type: DataTypes.JSONB, allowNull: false },
      // GCS object paths, audit-only — never used for matching.
      photoObjectPathFront: { type: DataTypes.STRING, allowNull: true },
      photoObjectPathLeft: { type: DataTypes.STRING, allowNull: true },
      photoObjectPathRight: { type: DataTypes.STRING, allowNull: true },
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
