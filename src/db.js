// src/db.js
const { Pool } = require("pg");

// Reutilizamos el pool entre invocaciones (en serverless)
let pool = global.__pgPool;
if (!pool) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL, // tu cadena completa de Supabase
    ssl: { rejectUnauthorized: false },         // Supabase requiere SSL
    max: 5,                                     // prudente en serverless
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  global.__pgPool = pool;
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
