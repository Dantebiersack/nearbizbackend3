// db.js
const { Pool } = require("pg");

const useUrl = !!process.env.DATABASE_URL;
const base = useUrl
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST,
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      port: Number(process.env.PGPORT || 5432),
    };

const pool = new Pool({
  ...base,
  ssl: {
    rejectUnauthorized: String(process.env.PGREJECTUNAUTHORIZED || "false") === "true" ? true : false,
  },
  max: 10,
  idleTimeoutMillis: 30000,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
