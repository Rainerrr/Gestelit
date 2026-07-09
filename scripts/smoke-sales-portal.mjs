#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const appUrl = process.env.APP_URL ?? "http://localhost:3000";
const adminPassword = process.env.ADMIN_PASSWORD;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!adminPassword || !supabaseUrl || !serviceRoleKey) {
  console.error("Missing ADMIN_PASSWORD, NEXT_PUBLIC_SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

function hashSalesPassword(password, salt = crypto.randomBytes(16).toString("base64url")) {
  const key = crypto.scryptSync(password, salt, 64).toString("base64url");
  return `scrypt$${salt}$${key}`;
}

async function request(pathname, options = {}) {
  const response = await fetch(`${appUrl}${pathname}`, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

function cookieFrom(response) {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

const stamp = Date.now();
const qaEmail = `sales.qa.${stamp}@gestelit.local`;
const qaPassword = `qa-${stamp}`;
const qaName = `QA Sales ${stamp}`;
let salesUserId = null;
let activityId = null;
let attachmentRows = [];

try {
  const userInsert = await supabase
    .from("sales_users")
    .insert({
      email: qaEmail,
      full_name: qaName,
      password_hash: hashSalesPassword(qaPassword),
      is_active: true,
    })
    .select("id")
    .single();

  if (userInsert.error) throw userInsert.error;
  salesUserId = userInsert.data.id;

  const login = await request("/api/sales/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: qaEmail, password: qaPassword }),
  });
  if (!login.response.ok) {
    throw new Error(`Sales login failed: ${login.response.status} ${JSON.stringify(login.body)}`);
  }
  const salesCookie = cookieFrom(login.response);

  const form = new FormData();
  form.set("event_type", "meeting");
  form.set("event_at", new Date().toISOString());
  form.set("customer_name", `QA לקוח ${stamp}`);
  form.set("contact_person", "QA Contact");
  form.set("raw_note", "בדיקת פורטל מכירות: פגישה, הזדמנות, מסמך מצורף וסכום.");
  form.set("estimated_revenue", "12345");
  form.set("actual_revenue", "2345");
  form.set("currency", "ILS");
  form.set("status", "open");
  form.set("ai_next_action", "לחזור ללקוח מחר");
  form.set("next_action_date", new Date().toISOString().slice(0, 10));
  form.append(
    "attachments",
    new File([Buffer.from("89504e470d0a1a0a", "hex")], "qa-sales.png", { type: "image/png" }),
  );

  const create = await request("/api/sales/activity", {
    method: "POST",
    headers: { Cookie: salesCookie },
    body: form,
  });
  if (!create.response.ok) {
    throw new Error(`Sales activity create failed: ${create.response.status} ${JSON.stringify(create.body)}`);
  }
  activityId = create.body.activity.id;
  attachmentRows = create.body.activity.attachments ?? [];
  if (attachmentRows.length !== 1) {
    throw new Error("Expected one uploaded attachment.");
  }

  const own = await request("/api/sales/activity?limit=10", {
    headers: { Cookie: salesCookie },
  });
  if (!own.response.ok || !own.body.rows.some((row) => row.id === activityId)) {
    throw new Error("Sales portal did not return the submitted activity.");
  }

  const mark = await request(`/api/sales/activity/${activityId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: salesCookie,
    },
    body: JSON.stringify({ status: "won" }),
  });
  if (!mark.response.ok || mark.body.activity.status !== "won") {
    throw new Error(`Sales status mark failed: ${mark.response.status} ${JSON.stringify(mark.body)}`);
  }

  const adminLogin = await request("/api/admin/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: adminPassword }),
  });
  if (!adminLogin.response.ok) {
    throw new Error(`Admin login failed: ${adminLogin.response.status} ${JSON.stringify(adminLogin.body)}`);
  }
  const adminCookie = cookieFrom(adminLogin.response);

  const adminRows = await request(`/api/admin/sales-daily-log?salesperson=${encodeURIComponent(qaName)}&limit=20`, {
    headers: { Cookie: adminCookie },
  });
  if (!adminRows.response.ok) {
    throw new Error(`Admin sales fetch failed: ${adminRows.response.status} ${JSON.stringify(adminRows.body)}`);
  }
  const adminActivity = adminRows.body.rows.find((row) => row.id === activityId);
  if (!adminActivity) throw new Error("Admin dashboard API did not return the sales portal activity.");
  if (adminActivity.status !== "won") throw new Error("Admin API did not see the marked sales status.");
  if ((adminActivity.attachments ?? []).length !== 1) throw new Error("Admin API did not expose the uploaded attachment.");

  console.log(JSON.stringify({
    ok: true,
    salesUserId,
    activityId,
    salesperson: qaName,
    adminStatus: adminActivity.status,
    attachments: adminActivity.attachments.length,
  }, null, 2));
} finally {
  if (attachmentRows.length > 0) {
    await supabase.storage
      .from("sales-activity-attachments")
      .remove(attachmentRows.map((attachment) => attachment.storage_path));
  }
  if (activityId) {
    await supabase.from("sales_activity_attachments").delete().eq("sales_activity_id", activityId);
    await supabase.from("sales_activity_logs").delete().eq("id", activityId);
  }
  if (salesUserId) {
    await supabase.from("sales_users").delete().eq("id", salesUserId);
  }
}
