/**
 * Discovery script — run this first on the BINA server to see what tables/data are available.
 * Usage: npm run discover
 * Output: discover-report.json with all tables, columns, row counts, and sample data.
 */

import { getPool, closePool } from "./db";
import fs from "fs";

interface TableInfo {
  schema: string;
  name: string;
  type: string;
  rowCount: number;
  columns: { name: string; type: string; maxLength: number | null; isNullable: boolean }[];
  sampleRows: Record<string, unknown>[];
}

async function discover() {
  console.log("Connecting to BINA database...");
  const pool = await getPool();
  console.log("Connected!\n");

  // Get all tables and views
  const tablesResult = await pool.request().query(`
    SELECT
      TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
    FROM INFORMATION_SCHEMA.TABLES
    ORDER BY TABLE_SCHEMA, TABLE_NAME
  `);

  console.log(`Found ${tablesResult.recordset.length} tables/views\n`);

  const report: TableInfo[] = [];

  for (const row of tablesResult.recordset) {
    const fullName = `[${row.TABLE_SCHEMA}].[${row.TABLE_NAME}]`;
    process.stdout.write(`Scanning ${fullName}...`);

    try {
      // Get row count
      const countResult = await pool.request().query(
        `SELECT COUNT(*) as cnt FROM ${fullName}`
      );
      const rowCount = countResult.recordset[0].cnt;

      // Get columns
      const columnsResult = await pool.request().query(`
        SELECT
          COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = '${row.TABLE_SCHEMA}' AND TABLE_NAME = '${row.TABLE_NAME}'
        ORDER BY ORDINAL_POSITION
      `);

      const columns = columnsResult.recordset.map((c: Record<string, unknown>) => ({
        name: c.COLUMN_NAME as string,
        type: c.DATA_TYPE as string,
        maxLength: c.CHARACTER_MAXIMUM_LENGTH as number | null,
        isNullable: c.IS_NULLABLE === "YES",
      }));

      // Get sample rows (top 3)
      let sampleRows: Record<string, unknown>[] = [];
      if (rowCount > 0) {
        const sampleResult = await pool.request().query(
          `SELECT TOP 3 * FROM ${fullName}`
        );
        sampleRows = sampleResult.recordset;
      }

      const info: TableInfo = {
        schema: row.TABLE_SCHEMA,
        name: row.TABLE_NAME,
        type: row.TABLE_TYPE,
        rowCount,
        columns,
        sampleRows,
      };

      report.push(info);
      console.log(` ${rowCount} rows, ${columns.length} columns`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(` ERROR: ${message}`);
    }
  }

  // Write full report
  const reportPath = "discover-report.json";
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nFull report saved to ${reportPath}`);

  // Print summary
  console.log("\n=== SUMMARY ===\n");
  console.log("Tables with data (sorted by row count):\n");

  const withData = report.filter((t) => t.rowCount > 0).sort((a, b) => b.rowCount - a.rowCount);
  for (const t of withData) {
    console.log(`  ${t.schema}.${t.name} — ${t.rowCount} rows (${t.columns.length} cols)`);
  }

  console.log(`\nEmpty tables: ${report.filter((t) => t.rowCount === 0).length}`);
  console.log(`Tables with data: ${withData.length}`);

  // Print likely useful tables for manufacturing
  console.log("\n=== LIKELY RELEVANT TABLES ===\n");
  const keywords = [
    "order", "job", "work", "prod", "item", "customer", "worker", "employ",
    "machine", "station", "material", "invent", "stock", "delivery", "schedule",
  ];
  for (const t of withData) {
    const lower = t.name.toLowerCase();
    if (keywords.some((k) => lower.includes(k))) {
      console.log(`  * ${t.schema}.${t.name} — ${t.rowCount} rows`);
      console.log(`    Columns: ${t.columns.map((c) => c.name).join(", ")}`);
      console.log();
    }
  }

  await closePool();
}

discover().catch((err) => {
  console.error("Discovery failed:", err);
  process.exit(1);
});
