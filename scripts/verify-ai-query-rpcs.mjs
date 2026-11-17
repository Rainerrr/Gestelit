#!/usr/bin/env node
// Read-only post-migration canary. No model calls, inserts, edits, or DDL.
// node scripts/verify-ai-query-rpcs.mjs --env-json /private/production-env.json --sales-user-id <existing-active-user-uuid>
import { readFile } from "node:fs/promises";
const args = process.argv.slice(2);
const arg = (key) => { const index = args.indexOf(key); return index >= 0 ? args[index + 1] : undefined; };
const envPath = arg("--env-json");
let env = process.env;
if (envPath) { const value = JSON.parse(await readFile(envPath, "utf8")); env = { ...process.env, ...value }; }
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const viewer = arg("--sales-user-id");
if (!url || !serviceKey || !/^[0-9a-f-]{36}$/i.test(viewer ?? "")) throw new Error("Provide configured environment and --sales-user-id for an existing active sales user. No secret values are printed.");
async function rpc(name, body, key = serviceKey) {
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}
function check(condition, label) { if (!condition) throw new Error(`FAIL: ${label}`); console.log(`PASS: ${label}`); }
const admin = await rpc("ai_query_analytics", { plan: { dataset: "work_orders", measures: [{ op: "count" }], limit: 1 } });
check(admin.ok && admin.data?.source === "mart_bina_work_order_status" && admin.data?.rows?.length <= 1 && admin.data.scannedRows <= 20000, "admin bounded SELECT RPC");
const invalid = await rpc("ai_query_analytics", { plan: { dataset: "sales_users", sql: "SELECT password_hash FROM sales_users" } });
check(!invalid.ok && invalid.status >= 400 && invalid.status < 500, "admin rejects raw SQL and unapproved dataset");
const personal = await rpc("ai_query_sales_analytics", { plan: { dataset: "sales_activity", measures: [{ op: "count" }], limit: 1 }, viewer_id: viewer, requested_scope: "personal" });
check(personal.ok && personal.data?.source === "mart_sales_activity_scoped" && personal.data?.rows?.length <= 1, "sales personal scoped SELECT RPC");
const canTeam = await rpc("sales_user_has_scope", { p_sales_user_id: viewer, p_scope_key: "sales_team_view" });
check(canTeam.ok && typeof canTeam.data === "boolean", "current DB team permission can be read");
const team = await rpc("ai_query_sales_analytics", { plan: { dataset: "sales_activity", measures: [{ op: "count" }], limit: 1 }, viewer_id: viewer, requested_scope: "team" });
check(canTeam.data ? team.ok : !team.ok, canTeam.data ? "authorized team SELECT RPC" : "sales rep team escalation denied");
const salesEscape = await rpc("ai_query_sales_analytics", { plan: { dataset: "work_orders", scope: "team" }, viewer_id: viewer, requested_scope: "personal" });
check(!salesEscape.ok, "sales rejects cross-domain plan and model-controlled scope");
if (anonKey) {
  const forbidden = await rpc("ai_query_sales_analytics", { plan: { dataset: "sales_activity" }, viewer_id: viewer, requested_scope: "team" }, anonKey);
  check(!forbidden.ok, "anonymous RPC invocation denied");
}
console.log("Read-only canaries complete. No business record content or credential values were printed. Query timeout hoisting still requires the deployed PostgREST configuration to honor function settings.");
