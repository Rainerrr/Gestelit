import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import XLSX from "xlsx";
import { normalizeClientIndexRows } from "./lib/client-index-import.mjs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const inputPath = path.resolve(args.find((argument) => !argument.startsWith("--")) ?? "/tmp/bina-client-index.xlsx");
const batchSize = 500;

if (!fs.existsSync(inputPath)) {
  throw new Error(`Client index file not found: ${inputPath}`);
}

const workbook = XLSX.readFile(inputPath);
const sheetName = workbook.SheetNames[0];
if (!sheetName) throw new Error("Workbook has no sheets");

// raw:false preserves the exact formatted calendar date shown in Excel.
const workbookRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: false });
const stat = fs.statSync(inputPath);
const importedAt = new Date().toISOString();
const normalized = normalizeClientIndexRows(workbookRows, {
  filename: path.basename(inputPath),
  updatedAt: stat.mtime.toISOString(),
  importedAt,
});

console.log(JSON.stringify({
  file: inputPath,
  sheet: sheetName,
  sourceRows: workbookRows.length,
  validRows: normalized.rows.length,
  skippedRows: normalized.skipped,
  duplicateCodes: normalized.duplicates,
  dryRun,
}, null, 2));

if (dryRun) process.exit(0);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

for (let offset = 0; offset < normalized.rows.length; offset += batchSize) {
  const batch = normalized.rows.slice(offset, offset + batchSize);
  const { error } = await supabase
    .from("bina_client_index")
    .upsert(batch, { onConflict: "customer_code" });
  if (error) throw new Error(`Import failed at offset ${offset}: ${error.message}`);
  console.log(`Imported ${Math.min(offset + batch.length, normalized.rows.length)}/${normalized.rows.length}`);
}

console.log(`Client index import complete: ${normalized.rows.length} clients`);
