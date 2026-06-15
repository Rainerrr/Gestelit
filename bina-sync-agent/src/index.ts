/**
 * BINA Sync Agent
 * Runs on the BINA server, queries local SQL Server, pushes data to Gestelit API.
 * Runs as a Windows service or standalone process.
 */

import { getPool, closePool } from "./db";
import dotenv from "dotenv";

dotenv.config();

const API_URL = process.env.GESTELIT_API_URL || "";
const SYNC_KEY = process.env.GESTELIT_SYNC_KEY || "";
const INTERVAL_MS = (parseInt(process.env.SYNC_INTERVAL_MINUTES || "5")) * 60 * 1000;

interface SyncPayload {
  synced_at: string;
  tables: Record<string, unknown[]>;
}

/**
 * Define which BINA tables/queries to sync.
 * Update this after running discover.ts to know what tables exist.
 */
const SYNC_QUERIES: Record<string, string> = {
  // Placeholder queries — replace with real ones after discovery
  // Example:
  // "orders": "SELECT * FROM [dbo].[Orders] WHERE ModifiedDate > @lastSync",
  // "customers": "SELECT * FROM [dbo].[Customers]",
  // "items": "SELECT * FROM [dbo].[Items]",
};

async function syncOnce(): Promise<void> {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] Starting sync...`);

  if (Object.keys(SYNC_QUERIES).length === 0) {
    console.log("No sync queries configured. Run 'npm run discover' first to see available tables.");
    console.log("Then update SYNC_QUERIES in src/index.ts with the tables you want to sync.");
    return;
  }

  const pool = await getPool();
  const tables: Record<string, unknown[]> = {};

  for (const [name, query] of Object.entries(SYNC_QUERIES)) {
    try {
      const result = await pool.request().query(query);
      tables[name] = result.recordset;
      console.log(`  ${name}: ${result.recordset.length} rows`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ${name}: ERROR — ${message}`);
    }
  }

  const payload: SyncPayload = {
    synced_at: new Date().toISOString(),
    tables,
  };

  // Push to Gestelit API
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sync-Key": SYNC_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API responded ${response.status}: ${text}`);
  }

  const elapsed = Date.now() - startTime;
  console.log(`[${new Date().toISOString()}] Sync complete in ${elapsed}ms`);
}

async function main(): Promise<void> {
  console.log("BINA Sync Agent starting...");
  console.log(`API URL: ${API_URL}`);
  console.log(`Sync interval: ${INTERVAL_MS / 1000}s`);
  console.log();

  if (!API_URL || !SYNC_KEY) {
    console.error("ERROR: GESTELIT_API_URL and GESTELIT_SYNC_KEY must be set in .env");
    process.exit(1);
  }

  // Initial sync
  await syncOnce();

  // Schedule recurring syncs
  setInterval(async () => {
    try {
      await syncOnce();
    } catch (err) {
      console.error("Sync failed:", err);
    }
  }, INTERVAL_MS);

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");
    await closePool();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
