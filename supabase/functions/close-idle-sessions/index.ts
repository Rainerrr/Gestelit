import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-expect-error jsr imports are resolved in the Supabase Edge runtime
import { createClient } from "jsr:@supabase/supabase-js@2";

// Deno globals are provided at runtime in the Edge environment
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (handler: (request: Request) => Response | Promise<Response>) => void;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase credentials for close-idle-sessions");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const IDLE_THRESHOLD_MS = 5 * 60 * 1000;

type SessionRow = { id: string; last_seen_at: string | null; started_at: string };
type StatusDefinitionRow = {
  id: string;
  machine_state: string | null;
  scope: string | null;
  created_at?: string | null;
};

const resolveStoppedStatusId = async () => {
  const { data, error } = await supabase
    .from("status_definitions")
    .select("id, machine_state, scope, created_at")
    .order("created_at", { ascending: true });

  const items = (data as StatusDefinitionRow[]) ?? [];

  if (error || items.length === 0) {
    console.error("[close-idle-sessions] Failed to resolve stopped status id", error);
    return null;
  }

  // Find a stoppage status by machine_state (language-agnostic approach)
  const preferred = items.find((item) => item.machine_state === "stoppage");

  return (preferred ?? items[0]).id;
};

const closeSession = async (sessionId: string, timestamp: string) => {
  const stoppedStatusId = await resolveStoppedStatusId();

  if (!stoppedStatusId) {
    throw new Error("STOPPED_STATUS_ID_NOT_FOUND");
  }

  await supabase
    .from("status_events")
    .update({ ended_at: timestamp })
    .eq("session_id", sessionId)
    .is("ended_at", null);

  await supabase.from("status_events").insert({
    session_id: sessionId,
    status_definition_id: stoppedStatusId,
    station_reason_id: "general-malfunction",
    note: "auto-abandon",
    started_at: timestamp,
  });

  await supabase
    .from("sessions")
    .update({
      status: "completed",
      ended_at: timestamp,
      forced_closed_at: timestamp,
      current_status_id: stoppedStatusId,
      last_status_change_at: timestamp,
    })
    .eq("id", sessionId);
};

Deno.serve(async () => {
  const idleSinceMs = Date.now() - IDLE_THRESHOLD_MS;
  const idleSince = new Date(idleSinceMs).toISOString();

  // Fetch all active sessions (without filtering by last_seen_at in query)
  // We need to check both last_seen_at and started_at as fallback
  const { data, error } = await supabase
    .from("sessions")
    .select("id, last_seen_at, started_at")
    .eq("status", "active")
    .is("ended_at", null)
    .is("forced_closed_at", null);

  if (error) {
    console.error("[close-idle-sessions] Failed to fetch sessions", error);
    return new Response(JSON.stringify({ ok: false, error: "FETCH_FAILED" }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }

  const sessions = (data as SessionRow[]) ?? [];

  // Filter idle sessions in code to handle null last_seen_at
  const idleSessions = sessions.filter((session) => {
    const lastActivity = session.last_seen_at ?? session.started_at;
    if (!lastActivity) return false;
    return new Date(lastActivity).getTime() < idleSinceMs;
  });

  const closed: string[] = [];
  for (const session of idleSessions) {
    const timestamp = new Date().toISOString();
    try {
      await closeSession(session.id, timestamp);
      closed.push(session.id);
    } catch (err) {
      console.error(
        `[close-idle-sessions] Failed to close session ${session.id}`,
        err,
      );
    }
  }

  return new Response(
    JSON.stringify({ ok: true, checked: sessions.length, closed: closed.length, closedIds: closed }),
    { headers: { "Content-Type": "application/json" } },
  );
});
