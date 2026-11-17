#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

const tables = ["chat_threads", "chat_messages", "chat_thread_reads"];

let ok = true;
for (const table of tables) {
  const { error } = await supabase.from(table).select("*").limit(1);
  if (error) {
    ok = false;
    console.error(`${table}: ${error.code ?? "ERROR"} ${error.message}`);
  } else {
    console.log(`${table}: OK`);
  }
}

if (!ok) {
  console.error(
    "\nChat schema is not ready. Apply supabase/migrations/20260708120000_create_in_app_chat.sql.",
  );
  process.exit(1);
}

console.log("\nChat schema ready.");
