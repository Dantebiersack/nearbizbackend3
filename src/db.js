import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.PG_CONNECTION,
  ssl: { rejectUnauthorized: false },
});

export default pool;
