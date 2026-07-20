'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class QrAttendanceTerminal extends Model {
    static associate(models) {
      QrAttendanceTerminal.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      QrAttendanceTerminal.belongsTo(models.Brand, { foreignKey: 'brandId', as: 'brand' });
      QrAttendanceTerminal.hasMany(models.Attendance, { foreignKey: 'terminalId', as: 'attendanceRecords' });
    }
  }

  QrAttendanceTerminal.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      // Nullable: a company-level terminal (brandId null) authenticates
      // check-ins for every employee in the company regardless of brand.
      brandId: { type: DataTypes.BIGINT, allowNull: true },
      terminalCode: { type: DataTypes.STRING, allowNull: false },
      secretKey: { type: DataTypes.STRING, allowNull: false },
      rotationSeconds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 8 },
      status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
      },
    },
    {
      sequelize,
      modelName: 'QrAttendanceTerminal',
      tableName: 'qr_attendance_terminals',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(QrAttendanceTerminal);

  return QrAttendanceTerminal;
};
