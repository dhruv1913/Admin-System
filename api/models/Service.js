const { DataTypes } = require("sequelize");
const sequelize = require("../utils/database");

const Service = sequelize.define(
  "Service",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    service_key: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    service_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    department_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    service_url: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    secret_key: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
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
    tableName: "services",
    timestamps: false,
  }
);



module.exports = Service;
