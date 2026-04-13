const { Sequelize } = require('sequelize');
require('dotenv').config();

// 🚨 Strictly using environment variables
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false // Turn to true if you need to debug SQL queries
  }
);

module.exports = sequelize;