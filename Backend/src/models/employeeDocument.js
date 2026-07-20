'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EmployeeDocument extends Model {
    static associate(models) {
      EmployeeDocument.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
    }
  }

  EmployeeDocument.init(
    {
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      type: { type: DataTypes.STRING, allowNull: false },
      fileUrl: { type: DataTypes.STRING, allowNull: false },
      verified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      sequelize,
      modelName: 'EmployeeDocument',
      tableName: 'employee_documents',
      underscored: true,
      paranoid: true,
    }
  );

  return EmployeeDocument;
};
