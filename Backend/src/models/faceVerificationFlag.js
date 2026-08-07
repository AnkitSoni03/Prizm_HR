'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class FaceVerificationFlag extends Model {
    static associate(models) {
      FaceVerificationFlag.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      FaceVerificationFlag.belongsTo(models.User, { foreignKey: 'kioskUserId', as: 'kioskUser' });
      FaceVerificationFlag.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      FaceVerificationFlag.belongsTo(models.Attendance, { foreignKey: 'attendanceId', as: 'attendance' });
      FaceVerificationFlag.belongsTo(models.User, { foreignKey: 'reviewedByUserId', as: 'reviewedBy' });
    }
  }

  FaceVerificationFlag.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      kioskUserId: { type: DataTypes.BIGINT, allowNull: false },
      action: { type: DataTypes.ENUM('checkin', 'checkout'), allowNull: false },
      employeeId: { type: DataTypes.BIGINT, allowNull: true },
      attendanceId: { type: DataTypes.BIGINT, allowNull: true },
      reason: { type: DataTypes.ENUM('anti_spoof_model', 'screen_artifact'), allowNull: false },
      blocked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      realLogit: { type: DataTypes.FLOAT, allowNull: true },
      spoofLogit: { type: DataTypes.FLOAT, allowNull: true },
      antiSpoofConfidence: { type: DataTypes.FLOAT, allowNull: true },
      screenArtifactScore: { type: DataTypes.FLOAT, allowNull: true },
      videoObjectPath: { type: DataTypes.STRING, allowNull: true },
      reviewed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      reviewedByUserId: { type: DataTypes.BIGINT, allowNull: true },
      reviewedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'FaceVerificationFlag',
      tableName: 'face_verification_flags',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(FaceVerificationFlag);

  return FaceVerificationFlag;
};
