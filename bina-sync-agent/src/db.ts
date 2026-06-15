import sql from "mssql";
import dotenv from "dotenv";

dotenv.config();

const config: sql.config = {
  server: process.env.BINA_HOST || "localhost",
  port: parseInt(process.env.BINA_PORT || "1433"),
  user: process.env.BINA_USER,
  password: process.env.BINA_PASSWORD,
  database: process.env.BINA_DATABASE || "BinaW18",
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  connectionTimeout: 15000,
  requestTimeout: 30000,
};

if (!config.user || !config.password) {
  throw new Error("BINA_USER and BINA_PASSWORD must be set in the environment");
}

let pool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool || !pool.connected) {
    pool = await sql.connect(config);
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}
