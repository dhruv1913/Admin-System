module.exports = (sequelize, DataTypes) => {
  const LoginAttempt = sequelize.define(
    "LoginAttempt",
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },

      username: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },

      service_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },

      attempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      captcha_required: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      last_attempt_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "login_attempts",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          unique: true,
          fields: ["username", "service_id"],
        },
      ],
    }
  );

  return LoginAttempt;
};
