'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

// One-time extra pay for one employee in one month — see migration
// 20261014090100.
module.exports = (sequelize, DataTypes) => {
  class PayrollBonus extends Model {
    static associate(models) {
      PayrollBonus.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      PayrollBonus.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      PayrollBonus.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'createdByUser' });
    }
  }

  PayrollBonus.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      groupId: { type: DataTypes.BIGINT, allowNull: false },
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      periodYear: { type: DataTypes.INTEGER, allowNull: false },
      periodMonth: { type: DataTypes.INTEGER, allowNull: false },
      type: {
        type: DataTypes.ENUM('bonus', 'incentive', 'overtime', 'reimbursement', 'other'),
        allowNull: false,
      },
      title: { type: DataTypes.STRING(120), allowNull: true },
      calcType: { type: DataTypes.ENUM('fixed', 'percent'), allowNull: false, defaultValue: 'fixed' },
      percent: {
        type: DataTypes.DECIMAL(7, 2),
        allowNull: true,
        get() {
          const raw = this.getDataValue('percent');
          return raw === null || raw === undefined ? raw : Number(raw);
        },
      },
      basis: { type: DataTypes.ENUM('basic', 'gross'), allowNull: true },
      amount: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        get() {
          const raw = this.getDataValue('amount');
          return raw === null || raw === undefined ? raw : Number(raw);
        },
      },
      taxable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      note: { type: DataTypes.TEXT, allowNull: true },
      createdByUserId: { type: DataTypes.BIGINT, allowNull: true },
      updatedByUserId: { type: DataTypes.BIGINT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'PayrollBonus',
      tableName: 'payroll_bonuses',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(PayrollBonus);

  return PayrollBonus;
};
