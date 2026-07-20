'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ShiftRoster extends Model {
    static associate(models) {
      ShiftRoster.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      ShiftRoster.belongsTo(models.Shift, { foreignKey: 'shiftId', as: 'shift' });
      ShiftRoster.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      ShiftRoster.belongsTo(models.Brand, { foreignKey: 'brandId', as: 'brand' });
      ShiftRoster.belongsTo(models.Employee, { foreignKey: 'publishedBy', as: 'publisher' });
    }
  }

  ShiftRoster.init(
    {
      employeeId: { type: DataTypes.BIGINT, allowNull: true },
      shiftId: { type: DataTypes.BIGINT, allowNull: false },
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      // Nullable: a company-level roster (companies.uses_brands = false, or
      // a brand-mode company's company-wide slot) has no Brand.
      brandId: { type: DataTypes.BIGINT, allowNull: true },
      rosterDate: { type: DataTypes.DATEONLY, allowNull: false },
      status: {
        type: DataTypes.ENUM('draft', 'published'),
        allowNull: false,
        defaultValue: 'draft',
      },
      publishedBy: { type: DataTypes.BIGINT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'ShiftRoster',
      tableName: 'shift_rosters',
      underscored: true,
      paranoid: true,
    }
  );

  return ShiftRoster;
};
