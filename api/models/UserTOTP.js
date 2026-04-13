const { DataTypes } = require("sequelize");
const sequelize = require("../utils/database");

const UserTOTP = sequelize.define(
  "UserTOTP",
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

    totp_secret: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },

    device_id: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },

    is_totp_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    schema: "public",
    tableName: "user_totp",
    timestamps: false, // 🔥 removed created_on & updated_on
  }
);

module.exports = UserTOTP;
