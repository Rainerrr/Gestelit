import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase credentials for close-idle-sessions");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const IDLE_THRESHOLD_MS = 5 * 60 * 1000;

type SessionRow = {
  id: string;
};

const closeSession = async (sessionId: string, timestamp: string) => {
  await supabase
    .from("status_events")
    .update({ ended_at: timestamp })
    .eq("session_id", sessionId)
    .is("ended_at", null);

  await supabase.from("status_events").insert({
    session_id: sessionId,
    status: "stopped",
    note: "auto-abandon",
    started_at: timestamp,
  });

  await supabase
    .from("sessions")
    .update({
      status: "completed",
      ended_at: timestamp,
      forced_closed_at: timestamp,
      current_status: "stopped",
      last_status_change_at: timestamp,
    })
    .eq("id", sessionId);
};

Deno.serve(async () => {
  const idleSince = new Date(Date.now() - IDLE_THRESHOLD_MS).toISOString();

  const { data, error } = await supabase
    .from("sessions")
    .select("id")
    .eq("status", "active")
    .lt("last_seen_at", idleSince)
    .is("forced_closed_at", null);

  if (error) {
    console.error("[close-idle-sessions] Failed to fetch sessions", error);
    return new Response(
      JSON.stringify({ ok: false, error: "FETCH_FAILED" }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      },
    );
  }

  const sessions = (data as SessionRow[]) ?? [];

  for (const session of sessions) {
    const timestamp = new Date().toISOString();
    try {
      await closeSession(session.id, timestamp);
    } catch (error) {
      console.error(
        `[close-idle-sessions] Failed to close session ${session.id}`,
        error,
      );
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      closed: sessions.length,
    }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
});

