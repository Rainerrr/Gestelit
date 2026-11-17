#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

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

async function findActiveSession() {
  const { data, error } = await supabase
    .from("sessions")
    .select("id, worker_id, status, ended_at, workers(full_name, worker_code)")
    .eq("status", "active")
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (data) {
    const worker = Array.isArray(data.workers) ? data.workers[0] : data.workers;
    if (!worker?.worker_code) {
      throw new Error("Active session has no worker code.");
    }

    return {
      sessionId: data.id,
      workerCode: worker.worker_code,
      workerName: worker.full_name,
      temporary: false,
    };
  }

  return await createTemporaryWorkerSession();
}

async function createTemporaryWorkerSession() {
  const { data: activeSessions, error: activeError } = await supabase
    .from("sessions")
    .select("worker_id, station_id")
    .eq("status", "active")
    .is("ended_at", null);

  if (activeError) throw activeError;

  const activeWorkerIds = new Set((activeSessions ?? []).map((session) => session.worker_id));
  const activeStationIds = new Set((activeSessions ?? []).map((session) => session.station_id));

  const { data: workers, error: workersError } = await supabase
    .from("workers")
    .select("id, full_name, worker_code")
    .eq("is_active", true)
    .limit(100);

  if (workersError) throw workersError;

  const { data: stations, error: stationsError } = await supabase
    .from("stations")
    .select("id, name")
    .eq("is_active", true)
    .limit(100);

  if (stationsError) throw stationsError;

  const worker = (workers ?? []).find((candidate) => !activeWorkerIds.has(candidate.id));
  const station = (stations ?? []).find((candidate) => !activeStationIds.has(candidate.id));

  if (!worker?.worker_code || !station?.id) {
    throw new Error("No available worker/station pair found for temporary chat smoke session.");
  }

  const created = await request("/api/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Worker-Code": worker.worker_code,
    },
    body: JSON.stringify({
      workerId: worker.id,
      stationId: station.id,
    }),
  });

  if (!created.response.ok) {
    throw new Error(`Temporary session create failed: ${created.response.status} ${JSON.stringify(created.body)}`);
  }

  return {
    sessionId: created.body.session.id,
    workerCode: worker.worker_code,
    workerName: worker.full_name,
    temporary: true,
  };
}

async function cleanup(threadId) {
  if (!threadId) return;
  await supabase.from("chat_thread_reads").delete().eq("thread_id", threadId);
  await supabase.from("chat_messages").delete().eq("thread_id", threadId);
  await supabase.from("chat_threads").delete().eq("id", threadId);
}

async function closeTemporarySession(active) {
  if (!active?.temporary) return;

  const closed = await request("/api/sessions/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Worker-Code": active.workerCode,
    },
    body: JSON.stringify({ sessionId: active.sessionId }),
  });

  if (closed.response.ok) return;

  await supabase
    .from("sessions")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
    })
    .eq("id", active.sessionId);
}

let threadId = null;
let active = null;

try {
  active = await findActiveSession();

  const login = await request("/api/admin/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: adminPassword }),
  });
  if (!login.response.ok) {
    throw new Error(`Admin login failed: ${login.response.status} ${JSON.stringify(login.body)}`);
  }
  const cookie = cookieFrom(login.response);

  const create = await request("/api/admin/chat/threads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({
      sessionId: active.sessionId,
      subject: "[QA] בדיקת הודעות",
      body: "בדיקת מערכת הודעות - הודעת מנהל.",
      priority: "normal",
      clientMessageId: `smoke-admin-${Date.now()}`,
    }),
  });
  if (!create.response.ok) {
    throw new Error(`Admin create thread failed: ${create.response.status} ${JSON.stringify(create.body)}`);
  }
  threadId = create.body.thread.id;

  const workerThreads = await request(`/api/chat/threads?sessionId=${encodeURIComponent(active.sessionId)}`, {
    headers: { "X-Worker-Code": active.workerCode },
  });
  if (!workerThreads.response.ok) {
    throw new Error(`Worker list threads failed: ${workerThreads.response.status} ${JSON.stringify(workerThreads.body)}`);
  }
  if (!workerThreads.body.threads.some((thread) => thread.id === threadId)) {
    throw new Error("Worker cannot see the admin-created thread.");
  }

  const workerReply = await request(`/api/chat/threads/${threadId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Worker-Code": active.workerCode,
    },
    body: JSON.stringify({
      body: "קיבלתי - בדיקת מערכת.",
      clientMessageId: `smoke-worker-${Date.now()}`,
    }),
  });
  if (!workerReply.response.ok) {
    throw new Error(`Worker reply failed: ${workerReply.response.status} ${JSON.stringify(workerReply.body)}`);
  }

  const adminMessages = await request(`/api/admin/chat/threads/${threadId}/messages`, {
    headers: { Cookie: cookie },
  });
  if (!adminMessages.response.ok) {
    throw new Error(`Admin list messages failed: ${adminMessages.response.status} ${JSON.stringify(adminMessages.body)}`);
  }
  if ((adminMessages.body.messages ?? []).length < 2) {
    throw new Error("Admin did not receive both smoke-test messages.");
  }

  const close = await request(`/api/admin/chat/threads/${threadId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({ status: "closed" }),
  });
  if (!close.response.ok) {
    throw new Error(`Admin close thread failed: ${close.response.status} ${JSON.stringify(close.body)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    threadId,
    workerName: active.workerName,
    sessionId: active.sessionId,
    temporarySession: active.temporary,
    messagesVerified: adminMessages.body.messages.length,
  }, null, 2));
} finally {
  await cleanup(threadId);
  await closeTemporarySession(active);
}
