'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Company extends Model {
    static associate(models) {
      Company.belongsTo(models.Group, { foreignKey: 'groupId', as: 'group' });
      Company.belongsTo(models.Plan, { foreignKey: 'planId', as: 'plan' });
      Company.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
      Company.hasMany(models.Role, { foreignKey: 'companyId', as: 'roles' });
      Company.hasMany(models.User, { foreignKey: 'companyId', as: 'users' });
      Company.hasMany(models.UserRole, { foreignKey: 'companyId', as: 'userRoles' });
      Company.hasMany(models.Invitation, { foreignKey: 'companyId', as: 'invitations' });
      Company.hasMany(models.Brand, { foreignKey: 'companyId', as: 'brands' });
      Company.hasMany(models.Department, { foreignKey: 'companyId', as: 'departments' });
      Company.hasMany(models.Designation, { foreignKey: 'companyId', as: 'designations' });
      Company.hasMany(models.Employee, { foreignKey: 'companyId', as: 'employees' });
      Company.hasMany(models.Shift, { foreignKey: 'companyId', as: 'shifts' });
      Company.hasMany(models.ShiftRoster, { foreignKey: 'companyId', as: 'shiftRosters' });
      Company.hasMany(models.EmployeeFaceProfile, { foreignKey: 'companyId', as: 'faceProfiles' });
    }
  }

  Company.init(
    {
      groupId: { type: DataTypes.BIGINT, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      legalName: { type: DataTypes.STRING, allowNull: true },
      gstNumber: { type: DataTypes.STRING, allowNull: true },
      status: {
        type: DataTypes.ENUM('trial', 'active', 'grace', 'suspended', 'terminated'),
        allowNull: false,
        defaultValue: 'trial',
      },
      planId: { type: DataTypes.BIGINT, allowNull: true },
      createdBy: { type: DataTypes.BIGINT, allowNull: true },
      usesBrands: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      sequelize,
      modelName: 'Company',
      tableName: 'companies',
      underscored: true,
      paranoid: true,
    }
  );

  return Company;
};
