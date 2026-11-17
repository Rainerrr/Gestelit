#!/usr/bin/env node
// Read-only release gate. Never applies migrations or prints credentials.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the process environment.");
const required = [
  "/sales_user_roles", "/sales_role_scopes", "/sales_account_assignments",
  "/sales_activity_log_audit", "/sales_login_rate_limits",
  "/rpc/consume_sales_login_rate_limit", "/rpc/get_sales_dashboard_summary",
  "/rpc/get_sales_user_clients", "/rpc/search_sales_client_activity_scoped",
  "/rpc/get_sales_activity_report_summary", "/rpc/get_sales_activity_report_rows",
  "/rpc/get_sales_dormant_accounts", "/rpc/get_filtered_bina_sales_total",
  "/rpc/get_sales_dashboard_filter_options", "/rpc/ai_query_analytics", "/rpc/ai_query_sales_analytics",
  "/chat_threads", "/chat_messages", "/chat_thread_reads",
];
const response = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
  signal: AbortSignal.timeout(15000),
});
if (!response.ok) throw new Error(`Schema discovery failed (${response.status}).`);
const schema = await response.json();
const missing = required.filter((path) => !schema.paths?.[path]);
console.log(JSON.stringify({ ready: missing.length === 0, checked: required.length, missing }, null, 2));
if (missing.length) process.exitCode = 1;
