'use strict';

const { Model } = require('sequelize');

// A lower payroll level asking the level that owns an employee's salary to
// hand that employee over (modules/payroll/payrollRelease.service.js).
// Group-level like payroll_templates — NOT tenant-scoped; the service bounds
// every query by group_id and the caller's level.
module.exports = (sequelize, DataTypes) => {
  class PayrollReleaseRequest extends Model {
    static associate(models) {
      PayrollReleaseRequest.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      PayrollReleaseRequest.belongsTo(models.SalaryAssignment, { foreignKey: 'assignmentId', as: 'assignment' });
      PayrollReleaseRequest.belongsTo(models.Company, { foreignKey: 'ownerCompanyId', as: 'ownerCompany' });
      PayrollReleaseRequest.belongsTo(models.Brand, { foreignKey: 'ownerBrandId', as: 'ownerBrand' });
      PayrollReleaseRequest.belongsTo(models.Company, { foreignKey: 'toCompanyId', as: 'toCompany' });
      PayrollReleaseRequest.belongsTo(models.Brand, { foreignKey: 'toBrandId', as: 'toBrand' });
      PayrollReleaseRequest.belongsTo(models.User, { foreignKey: 'requestedByUserId', as: 'requestedBy' });
      PayrollReleaseRequest.belongsTo(models.User, { foreignKey: 'decidedByUserId', as: 'decidedBy' });
    }
  }

  PayrollReleaseRequest.init(
    {
      groupId: { type: DataTypes.BIGINT, allowNull: false },
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      assignmentId: { type: DataTypes.BIGINT, allowNull: true },
      ownerCompanyId: { type: DataTypes.BIGINT, allowNull: true },
      ownerBrandId: { type: DataTypes.BIGINT, allowNull: true },
      toCompanyId: { type: DataTypes.BIGINT, allowNull: false },
      toBrandId: { type: DataTypes.BIGINT, allowNull: true },
      reason: { type: DataTypes.TEXT, allowNull: true },
      status: { type: DataTypes.ENUM('pending', 'approved', 'rejected', 'cancelled'), allowNull: false, defaultValue: 'pending' },
      requestedByUserId: { type: DataTypes.BIGINT, allowNull: true },
      decidedByUserId: { type: DataTypes.BIGINT, allowNull: true },
      decidedAt: { type: DataTypes.DATE, allowNull: true },
      decisionNote: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'PayrollReleaseRequest',
      tableName: 'payroll_release_requests',
      underscored: true,
      paranoid: true,
    }
  );

  return PayrollReleaseRequest;
};
