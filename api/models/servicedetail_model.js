const { DataTypes } = require("sequelize");
const sequelize = require("../utils/database");
const Service = require("./Service");

const ServiceDetails = sequelize.define(
  "ServiceDetails",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    service_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    en_dept_display_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    en_dept_title: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    hn_dept_display_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    hn_dept_title: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    logo_path: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    schema: "public",
    tableName: "service_details",
    timestamps: false,
  }
);

ServiceDetails.belongsTo(Service, { foreignKey: 'service_id' });
Service.hasOne(ServiceDetails, { foreignKey: 'service_id' });

module.exports = ServiceDetails;