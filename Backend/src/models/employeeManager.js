'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EmployeeManager extends Model {
    static associate(models) {
      EmployeeManager.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      EmployeeManager.belongsTo(models.Employee, { foreignKey: 'managerId', as: 'manager' });
    }
  }

  EmployeeManager.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      managerId: { type: DataTypes.BIGINT, allowNull: false },
    },
    {
      sequelize,
      modelName: 'EmployeeManager',
      tableName: 'employee_managers',
      underscored: true,
      paranoid: true,
    }
  );

  return EmployeeManager;
};
