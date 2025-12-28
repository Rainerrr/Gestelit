import { createServiceSupabase } from "@/lib/supabase/client";
import {
  fetchActiveStatusDefinitions,
} from "@/lib/data/status-definitions";
import type {
  Job,
  Session,
  SessionAbandonReason,
  SessionStatus,
  Station,
  StatusDefinition,
  StatusEvent,
  StatusEventState,
} from "@/lib/types";

const SESSION_GRACE_MS = 5 * 60 * 1000;

/**
 * Get current UTC timestamp in milliseconds.
 * Always use this for time comparisons to avoid timezone drift.
 */
function utcNow(): number {
  return Date.now(); // Date.now() is always UTC
}

/**
 * Parse an ISO timestamp string to UTC milliseconds.
 * Supabase TIMESTAMPTZ columns return ISO strings with timezone info.
 */
function parseUtcMs(isoString: string): number {
  return new Date(isoString).getTime();
}

type SessionPayload = {
  worker_id: string;
  station_id: string;
  job_id: string;
  started_at?: string;
};

async function getStoppedStatusId(): Promise<string> {
  const definitions = await fetchActiveStatusDefinitions();
  // Find a stoppage status by machine_state (language-agnostic approach)
  const stopped = definitions.find(
    (item) => item.machine_state === "stoppage",
  ) ?? definitions[0];

  if (!stopped) {
    throw new Error("STOPPED_STATUS_NOT_FOUND");
  }

  return stopped.id;
}

/**
 * Closes all active sessions for a worker.
 * Called before creating a new session to enforce single-session-per-worker.
 */
export async function closeActiveSessionsForWorker(
  workerId: string,
): Promise<string[]> {
  const supabase = createServiceSupabase();
  const timestamp = new Date().toISOString();

  // Find all active sessions for this worker
  const { data: activeSessions, error: fetchError } = await supabase
    .from("sessions")
    .select("id")
    .eq("worker_id", workerId)
    .eq("status", "active")
    .is("ended_at", null);

  if (fetchError) {
    throw new Error(
      `Failed to fetch active sessions for worker: ${fetchError.message}`,
    );
  }

  if (!activeSessions || activeSessions.length === 0) {
    return [];
  }

  const closedIds: string[] = [];
  const stoppedId = await getStoppedStatusId();

  for (const session of activeSessions) {
    // Use atomic database function to create final status event
    // This closes open events and mirrors to sessions in a single transaction
    const { error: statusError } = await supabase.rpc("create_status_event_atomic", {
      p_session_id: session.id,
      p_status_definition_id: stoppedId,
      p_station_reason_id: null,
      p_note: "replaced-by-new-session",
      p_image_url: null,
      p_malfunction_id: null,
    });

    if (statusError) {
      continue; // Skip this session if status event creation fails
    }

    // Close the session
    const { error: updateError } = await supabase
      .from("sessions")
      .update({
        status: "completed" as SessionStatus,
        ended_at: timestamp,
        forced_closed_at: timestamp,
      })
      .eq("id", session.id);

    if (!updateError) {
      closedIds.push(session.id);
    }
  }

  return closedIds;
}

async function getInitialStatusId(stationId: string): Promise<string> {
  const definitions = await fetchActiveStatusDefinitions(stationId);
  const sorted = definitions.sort(
    (a, b) =>
      new Date(a.created_at ?? 0).getTime() -
      new Date(b.created_at ?? 0).getTime(),
  );
  const globalFirst = sorted.find((item) => item.scope === "global") ?? sorted[0];
  if (!globalFirst) {
    throw new Error("INITIAL_STATUS_NOT_FOUND");
  }
  return globalFirst.id;
}

export async function createSession(
  payload: SessionPayload,
): Promise<Session> {
  const supabase = createServiceSupabase();
  const initialStatusId = await getInitialStatusId(payload.station_id);

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      ...payload,
      status: "active" satisfies SessionStatus,
      started_at: payload.started_at ?? new Date().toISOString(),
      current_status_id: initialStatusId,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create session: ${error.message}`);
  }

  const sessionRow = data as Session;

  const { error: eventError } = await supabase.from("status_events").insert({
    session_id: sessionRow.id,
    status_definition_id: initialStatusId,
    started_at: sessionRow.started_at,
  });

  if (eventError) {
    throw new Error(`Failed to log initial status event: ${eventError.message}`);
  }

  return sessionRow;
}

export async function completeSession(
  sessionId: string,
): Promise<Session> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("sessions")
    .update({
      status: "completed" satisfies SessionStatus,
      ended_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to complete session: ${error.message}`);
  }

  return data as Session;
}

type TotalsPayload = {
  total_good?: number;
  total_scrap?: number;
};

export async function updateSessionTotals(
  sessionId: string,
  totals: TotalsPayload,
): Promise<Session> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("sessions")
    .update(totals)
    .eq("id", sessionId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update session totals: ${error.message}`);
  }

  return data as Session;
}

export async function markSessionStarted(
  sessionId: string,
  startedAt?: string,
): Promise<Session> {
  const supabase = createServiceSupabase();
  const timestamp = startedAt ?? new Date().toISOString();
  const { data, error } = await supabase
    .from("sessions")
    .update({
      started_at: timestamp,
      ended_at: null,
      status: "active" satisfies SessionStatus,
      start_checklist_completed: true,
    })
    .eq("id", sessionId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to mark session started: ${error.message}`);
  }

  return data as Session;
}

export async function markEndChecklistCompleted(
  sessionId: string,
): Promise<Session> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("sessions")
    .update({
      end_checklist_completed: true,
    })
    .eq("id", sessionId)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Failed to mark end checklist completed: ${error.message}`,
    );
  }

  return data as Session;
}

type StatusEventPayload = {
  session_id: string;
  status_definition_id: StatusEventState;
  station_reason_id?: string | null;
  note?: string | null;
  image_url?: string | null;
  started_at?: string;
  malfunction_id?: string | null;
};

const assertStatusAllowedForSession = async (
  sessionId: string,
  statusDefinitionId: StatusEventState,
): Promise<{ station_id: string; definitions: StatusDefinition[] }> => {
  const supabase = createServiceSupabase();
  const { data: sessionRow, error: sessionError } = await supabase
    .from("sessions")
    .select("id, station_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !sessionRow) {
    throw new Error(sessionError?.message ?? "SESSION_NOT_FOUND");
  }

  const stationId = (sessionRow as { station_id: string }).station_id;
  const definitions = await fetchActiveStatusDefinitions(stationId);
  const isAllowed = definitions.some((item) => item.id === statusDefinitionId);

  if (!isAllowed) {
    throw new Error("STATUS_NOT_ALLOWED");
  }

  return { station_id: stationId, definitions };
};

export async function startStatusEvent(
  payload: StatusEventPayload,
): Promise<StatusEvent> {
  await assertStatusAllowedForSession(
    payload.session_id,
    payload.status_definition_id,
  );

  const supabase = createServiceSupabase();

  // Use atomic database function to eliminate race conditions
  // This function closes open events, inserts new event, and mirrors to sessions
  // all in a single transaction
  const { data, error } = await supabase.rpc("create_status_event_atomic", {
    p_session_id: payload.session_id,
    p_status_definition_id: payload.status_definition_id,
    p_station_reason_id: payload.station_reason_id ?? null,
    p_note: payload.note ?? null,
    p_image_url: payload.image_url ?? null,
    p_malfunction_id: payload.malfunction_id ?? null,
  });

  if (error) {
    throw new Error(`Failed to create status event: ${error.message}`);
  }

  return data as StatusEvent;
}

export async function recordSessionHeartbeat(sessionId: string): Promise<void> {
  const supabase = createServiceSupabase();
  const timestamp = new Date().toISOString();

  const { error } = await supabase
    .from("sessions")
    .update({ last_seen_at: timestamp })
    .eq("id", sessionId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to record session heartbeat: ${error.message}`);
  }
}

type WorkerActiveSessionRow = {
  id: string;
  worker_id: string;
  station_id: string;
  job_id: string;
  status: SessionStatus;
  current_status_id: StatusEventState | null;
  started_at: string;
  ended_at: string | null;
  total_good: number | null;
  total_scrap: number | null;
  last_seen_at: string | null;
  forced_closed_at: string | null;
  stations: Station | null;
  jobs: Job | null;
};

export type WorkerActiveSessionDetails = {
  session: Session;
  station: Station | null;
  job: Job | null;
};

export type WorkerGraceSessionDetails = WorkerActiveSessionDetails & {
  graceExpiresAt: string;
};

const workerSessionSelect = `
  id,
  worker_id,
  station_id,
  job_id,
  status,
  current_status_id,
  started_at,
  ended_at,
  total_good,
  total_scrap,
  last_seen_at,
  forced_closed_at,
  stations:stations(*),
  jobs:jobs(*)
`;

function mapSessionRow(row: WorkerActiveSessionRow): WorkerActiveSessionDetails {
  return {
    session: {
      id: row.id,
      worker_id: row.worker_id,
      station_id: row.station_id,
      job_id: row.job_id,
      status: row.status,
      current_status_id: row.current_status_id,
      started_at: row.started_at,
      ended_at: row.ended_at,
      total_good: row.total_good ?? 0,
      total_scrap: row.total_scrap ?? 0,
      last_seen_at: row.last_seen_at,
      forced_closed_at: row.forced_closed_at,
    },
    station: row.stations,
    job: row.jobs,
  };
}

export async function getGracefulActiveSession(
  workerId: string,
): Promise<WorkerGraceSessionDetails | null> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("sessions")
    .select(workerSessionSelect)
    .eq("worker_id", workerId)
    .eq("status", "active")
    .is("ended_at", null)
    .is("forced_closed_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to fetch graceful session for worker: ${error.message}`,
    );
  }

  if (!data) {
    return null;
  }

  const row = data as unknown as WorkerActiveSessionRow;
  const lastSeenSource = row.last_seen_at ?? row.started_at;

  // Use explicit UTC comparison to avoid timezone drift
  const lastSeenUtcMs = parseUtcMs(lastSeenSource);
  const graceExpiresAtMs = lastSeenUtcMs + SESSION_GRACE_MS;
  const graceExpiresAt = new Date(graceExpiresAtMs).toISOString();

  if (utcNow() >= graceExpiresAtMs) {
    await abandonActiveSession(row.id, "expired");
    return null;
  }

  const details = mapSessionRow(row);
  return {
    ...details,
    graceExpiresAt,
  };
}

export async function abandonActiveSession(
  sessionId: string,
  reason: SessionAbandonReason,
): Promise<void> {
  const supabase = createServiceSupabase();
  const timestamp = new Date().toISOString();

  const note =
    reason === "worker_choice" ? "worker-abandon" : "grace-window-expired";

  const stoppedId = await getStoppedStatusId();

  // Use atomic database function to create the final status event
  // This closes open events and mirrors to sessions in a single transaction
  const { error: statusError } = await supabase.rpc("create_status_event_atomic", {
    p_session_id: sessionId,
    p_status_definition_id: stoppedId,
    p_station_reason_id: null,
    p_note: note,
    p_image_url: null,
    p_malfunction_id: null,
  });

  if (statusError) {
    throw new Error(
      `Failed to log abandonment status event: ${statusError.message}`,
    );
  }

  // Update session status to completed (separate from status event)
  const { error: sessionError } = await supabase
    .from("sessions")
    .update({
      status: "completed" satisfies SessionStatus,
      ended_at: timestamp,
      forced_closed_at: timestamp,
    })
    .eq("id", sessionId);

  if (sessionError) {
    throw new Error(`Failed to abandon session: ${sessionError.message}`);
  }
}
