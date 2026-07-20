'use strict';

const { Model } = require('sequelize');

// No company_id column — scoped via its parent Payslip (already tenant-
// scoped), same pattern as leave_requests/employee_documents. Does not call
// applyTenantScope: that hook merges a company_id filter into every query,
// which would error on a table that has no such column.
module.exports = (sequelize, DataTypes) => {
  class PayslipComponent extends Model {
    static associate(models) {
      PayslipComponent.belongsTo(models.Payslip, { foreignKey: 'payslipId', as: 'payslip' });
      PayslipComponent.belongsTo(models.SalaryComponentDefinition, {
        foreignKey: 'componentDefinitionId',
        as: 'definition',
      });
    }
  }

  PayslipComponent.init(
    {
      payslipId: { type: DataTypes.BIGINT, allowNull: false },
      componentDefinitionId: { type: DataTypes.BIGINT, allowNull: true },
      category: {
        // 'employer_contribution' rows are system-computed, informational
        // only (employer PF/ESI share) — see payrollRun.service.js, which
        // deliberately never sums this category into gross or deductions.
        type: DataTypes.ENUM('earning', 'deduction', 'reimbursement', 'employer_contribution'),
        allowNull: false,
      },
      name: { type: DataTypes.STRING, allowNull: false },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    },
    {
      sequelize,
      modelName: 'PayslipComponent',
      tableName: 'payslip_components',
      underscored: true,
      paranoid: true,
    }
  );

  return PayslipComponent;
};
