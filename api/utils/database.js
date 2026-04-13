const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PWD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "postgres",
    timezone: "+05:30",   // 👈 Force IST for Sequelize
    dialectOptions: {
      useUTC: false,      // for reading from database
    },
  }
);

sequelize.authenticate()
  .then(() => {
    console.log("✅ Database connection has been established successfully.");
  })
  .catch((error) => {
    console.error("❌ Unable to connect to the database:", error);
  });


module.exports = sequelize;
