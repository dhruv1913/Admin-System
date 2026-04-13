const { DataTypes } = require("sequelize");
const sequelize = require("../utils/database");

const UserDevices = sequelize.define(
  "UserDevices",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    ldap_uid: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    device_id: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    device_name: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    device_type: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
     totp_failed_attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    totp_blocked_until: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_on: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_on: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    schema: "public",
    tableName: "user_devices",
    timestamps: false, // since we are using custom created_on/updated_on
  }
);

module.exports = UserDevices;
