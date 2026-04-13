// models/QrLoginSession.js
const { DataTypes } = require("sequelize");
const sequelize = require("../utils/database");

const QrLoginSession = sequelize.define(
  "QrLoginSession",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    session_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
    },

    // QR SVG / base64 / encoded payload
    qr_code_data: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // 🔥 LDAP UID replaces user_id
    ldap_uid: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: "LDAP UID of authenticated mobile user",
    },

    device_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    service_key: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: "portalA",
    },

    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "pending", // pending | scanned | approved | expired | used
    },

    ip_address: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    device_info: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // 🔥 When mobile app approves login
    approved_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    approved_ip: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    approved_device_info: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // 🔐 JWT or temporary login token after approval
    login_token: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // QR signature for tamper prevention
    qr_code_signature: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },

    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    ts: {
  type: DataTypes.BIGINT, // Date.now() value
  allowNull: false,
},

    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
      validate: {
        isAfterCreated(value) {
          if (this.created_at && value <= this.created_at) {
            throw new Error("expires_at must be greater than created_at");
          }
        },
      },
    },
  },
  {
    schema: "public",
    tableName: "qr_login_sessions",
    timestamps: false,

    hooks: {
      beforeUpdate: (record) => {
        record.updated_at = new Date();
      },
    },
  }
);

module.exports = QrLoginSession;
