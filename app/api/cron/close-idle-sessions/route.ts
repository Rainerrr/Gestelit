import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/client";

const IDLE_THRESHOLD_MS = 5 * 60 * 1000;

type SessionRow = {
  id: string;
  last_seen_at: string | null;
  started_at: string;
};

const resolveStoppedStatusId = async (
  supabase: ReturnType<typeof createServiceSupabase>,
) => {
  const { data, error } = await supabase
    .from("status_definitions")
    .select("id, label_he, scope, created_at")
    .order("created_at", { ascending: true });

  if (error || !data || data.length === 0) {
    console.error("[close-idle-sessions] Failed to resolve stopped status id", error);
    return null;
  }

  const preferred =
    data.find((item) => (item.label_he ?? "").includes("עצירה")) ??
    data.find((item) => (item.label_he ?? "").toLowerCase().includes("stop"));

  return (preferred ?? data[0]).id;
};

const closeSession = async (sessionId: string, timestamp: string) => {
  const supabase = createServiceSupabase();
  const stoppedStatusId = await resolveStoppedStatusId(supabase);

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
    note: "grace-window-expired",
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

export async function GET() {
  const supabase = createServiceSupabase();
  const idleSince = new Date(Date.now() - IDLE_THRESHOLD_MS).toISOString();
  const now = new Date().toISOString();

  console.log(
    `[close-idle-sessions] Running cleanup at ${now}, idle threshold: ${idleSince}`,
  );

  // Fetch sessions that are truly active (status='active', no ended_at, no forced_closed_at)
  const { data, error } = await supabase
    .from("sessions")
    .select("id, last_seen_at, started_at")
    .eq("status", "active")
    .is("ended_at", null)
    .is("forced_closed_at", null);

  if (error) {
    console.error("[close-idle-sessions] Failed to fetch sessions", error);
    return NextResponse.json(
      { ok: false, error: "FETCH_FAILED" },
      { status: 500 },
    );
  }

  const sessions = (data as SessionRow[]) ?? [];
  console.log(
    `[close-idle-sessions] Found ${sessions.length} active sessions`,
    sessions.map((s) => ({
      id: s.id,
      last_seen: s.last_seen_at,
      started: s.started_at,
    })),
  );

  const idleSessions = sessions.filter((session) => {
    const lastSeen = session.last_seen_at;
    if (!lastSeen) {
      console.log(`[close-idle-sessions] Session ${session.id} has no last_seen_at, using started_at`);
      const fallback = session.started_at;
      if (!fallback) {
        return false;
      }
      return new Date(fallback).getTime() < new Date(idleSince).getTime();
    }
    const isIdle = new Date(lastSeen).getTime() < new Date(idleSince).getTime();
    if (isIdle) {
      console.log(
        `[close-idle-sessions] Session ${session.id} is idle (last_seen: ${lastSeen})`,
      );
    }
    return isIdle;
  });

  console.log(`[close-idle-sessions] ${idleSessions.length} sessions are idle`);

  const closed: string[] = [];
  const timestamp = new Date().toISOString();

  for (const session of idleSessions) {
    try {
      console.log(`[close-idle-sessions] Closing session ${session.id}`);
      await closeSession(session.id, timestamp);
      closed.push(session.id);
      console.log(`[close-idle-sessions] Successfully closed session ${session.id}`);
    } catch (error) {
      console.error(
        `[close-idle-sessions] Failed to close session ${session.id}`,
        error,
      );
    }
  }

  const result = {
    ok: true,
    checked: sessions.length,
    closed: closed.length,
    closedIds: closed,
    timestamp: now,
  };

  console.log("[close-idle-sessions] Cleanup complete", result);

  return NextResponse.json(result);
}

