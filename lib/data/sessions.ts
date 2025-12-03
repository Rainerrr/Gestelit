import { createServiceSupabase } from "@/lib/supabase/client";
import type {
  Job,
  Session,
  SessionAbandonReason,
  SessionStatus,
  Station,
  StatusEvent,
  StatusEventState,
} from "@/lib/types";

const SESSION_GRACE_MS = 5 * 60 * 1000;

type SessionPayload = {
  worker_id: string;
  station_id: string;
  job_id: string;
  started_at?: string;
};

export async function createSession(
  payload: SessionPayload,
): Promise<Session> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      ...payload,
      status: "active" satisfies SessionStatus,
      started_at: payload.started_at ?? new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create session: ${error.message}`);
  }

  return data as Session;
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

async function closeOpenStatusEvents(sessionId: string) {
  const supabase = createServiceSupabase();
  const { error } = await supabase
    .from("status_events")
    .update({ ended_at: new Date().toISOString() })
    .is("ended_at", null)
    .eq("session_id", sessionId);

  if (error) {
    throw new Error(`Failed to close open status events: ${error.message}`);
  }
}

type StatusEventPayload = {
  session_id: string;
  status: StatusEventState;
  reason_id?: string | null;
  note?: string | null;
  image_url?: string | null;
  started_at?: string;
};

export async function startStatusEvent(
  payload: StatusEventPayload,
): Promise<StatusEvent> {
  await closeOpenStatusEvents(payload.session_id);
  const supabase = createServiceSupabase();
  const startedAt = payload.started_at ?? new Date().toISOString();
  const { data, error } = await supabase
    .from("status_events")
    .insert({
      ...payload,
      started_at: startedAt,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create status event: ${error.message}`);
  }

  const { error: sessionError } = await supabase
    .from("sessions")
    .update({
      current_status: payload.status,
      last_status_change_at: startedAt,
    })
    .eq("id", payload.session_id);

  if (sessionError) {
    throw new Error(
      `Failed to mirror status on session: ${sessionError.message}`,
    );
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
  current_status: StatusEventState | null;
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
  current_status,
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
      current_status: row.current_status,
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

  const row = data as WorkerActiveSessionRow;
  const lastSeenSource = row.last_seen_at ?? row.started_at;
  const graceExpiresAt = new Date(
    new Date(lastSeenSource).getTime() + SESSION_GRACE_MS,
  ).toISOString();

  if (Date.now() >= new Date(graceExpiresAt).getTime()) {
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

  await closeOpenStatusEvents(sessionId);

  const note =
    reason === "worker_choice" ? "worker-abandon" : "grace-window-expired";

  const { error: statusError } = await supabase.from("status_events").insert({
    session_id: sessionId,
    status: "stopped",
    note,
    started_at: timestamp,
  });

  if (statusError) {
    throw new Error(
      `Failed to log abandonment status event: ${statusError.message}`,
    );
  }

  const { error: sessionError } = await supabase
    .from("sessions")
    .update({
      status: "completed" satisfies SessionStatus,
      ended_at: timestamp,
      forced_closed_at: timestamp,
      current_status: "stopped",
      last_status_change_at: timestamp,
    })
    .eq("id", sessionId);

  if (sessionError) {
    throw new Error(`Failed to abandon session: ${sessionError.message}`);
  }
}

