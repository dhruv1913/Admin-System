const { DataTypes } = require("sequelize");
const sequelize = require("../utils/database");
const Service = require("./Service");
const LoginToken = require("./loginToken");

const LoginAuditLog = sequelize.define(
  "LoginAuditLog",
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    username: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    service_id: {
      type: DataTypes.INTEGER,
      references: {
        model: Service,
        key: "id",
      },
    },
    token_id: {
      type: DataTypes.BIGINT,
      references: {
        model: LoginToken,
        key: "id",
      },
    },
    action: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    ip_address: {
      type: DataTypes.STRING(50),
    },
    user_agent: {
      type: DataTypes.TEXT,
    },
    timestamp: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    schema: "public",
    tableName: "login_audit_logs",
    timestamps: false,
  }
);

module.exports = LoginAuditLog;
