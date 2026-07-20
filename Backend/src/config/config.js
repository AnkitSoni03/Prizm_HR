"use strict";

require("dotenv").config({ quiet: true });

const base = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: "postgres",
  logging: false,
};

module.exports = {
  development: {
    ...base,
    database: process.env.DB_NAME,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  },
  test: {
    ...base,
    database: process.env.DB_NAME_TEST || `${process.env.DB_NAME}_test`,
  },
  production: {
    ...base,
    database: process.env.DB_NAME,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  },
};
