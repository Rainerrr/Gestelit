import { createServiceSupabase } from "@/lib/supabase/client";
import {
  fetchActiveStatusDefinitions,
  getProtectedStatusDefinition,
} from "@/lib/data/status-definitions";
import { SESSION_GRACE_MS } from "@/lib/constants";
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
  job_id: string | null;
  started_at?: string;
  active_instance_id?: string;
  // Job item tracking (for production line WIP)
  job_item_id?: string | null;
  job_item_step_id?: string | null;
};

async function getStopStatusId(): Promise<string> {
  const stopStatus = await getProtectedStatusDefinition("stop");
  return stopStatus.id;
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
  const stopStatusId = await getStopStatusId();

  for (const session of activeSessions) {
    // Use atomic database function to create final status event
    // This closes open events and mirrors to sessions in a single transaction
    const { error: statusError } = await supabase.rpc("create_status_event_atomic", {
      p_session_id: session.id,
      p_status_definition_id: stopStatusId,
      p_station_reason_id: null,
      p_note: "replaced-by-new-session",
      p_image_url: null,
      p_report_id: null,
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

/**
 * Get the initial status ID for a new session.
 * Uses the protected "stop" status as the default starting status.
 */
async function getInitialStatusId(): Promise<string> {
  return getStopStatusId();
}

export async function createSession(
  payload: SessionPayload,
): Promise<Session> {
  const supabase = createServiceSupabase();
  const initialStatusId = await getInitialStatusId();

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      worker_id: payload.worker_id,
      station_id: payload.station_id,
      job_id: payload.job_id,
      started_at: payload.started_at ?? new Date().toISOString(),
      active_instance_id: payload.active_instance_id ?? null,
      status: "active" satisfies SessionStatus,
      current_status_id: initialStatusId,
      // Job item tracking (for production line WIP)
      job_item_id: payload.job_item_id ?? null,
      job_item_step_id: payload.job_item_step_id ?? null,
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
  const timestamp = new Date().toISOString();

  // Close any open status events before completing the session
  // This ensures reports linked to status events get proper ended_at timestamps
  const stopStatusId = await getStopStatusId();
  const { error: statusError } = await supabase.rpc("create_status_event_atomic", {
    p_session_id: sessionId,
    p_status_definition_id: stopStatusId,
    p_station_reason_id: null,
    p_note: "session-completed",
    p_image_url: null,
    p_report_id: null,
  });

  if (statusError) {
    // Log but don't fail - session completion is more important
    console.error(`[completeSession] Failed to close status events: ${statusError.message}`);
  }

  const { data, error } = await supabase
    .from("sessions")
    .update({
      status: "completed" satisfies SessionStatus,
      ended_at: timestamp,
    })
    .eq("id", sessionId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to complete session: ${error.message}`);
  }

  return data as Session;
}

// updateSessionTotals removed - session totals are now derived from status_events
// Use SUM(status_events.quantity_good/scrap) instead

/**
 * Bind a job item to an existing session.
 * Used when worker enters production and selects a job + job item.
 *
 * Updates the session with:
 * - job_id: The selected job
 * - job_item_id: The specific job item to work on
 * - job_item_step_id: The job_item_stations row linking the item to this station
 *
 * Also updates the job-related snapshot fields for historical records.
 */
export async function bindJobItemToSession(
  sessionId: string,
  jobId: string,
  jobItemId: string,
  jobItemStationId: string,
): Promise<Session> {
  const supabase = createServiceSupabase();

  // Verify job item exists and belongs to this job
  const { data: jobItem, error: jobItemError } = await supabase
    .from("job_items")
    .select("id, job_id, is_active")
    .eq("id", jobItemId)
    .maybeSingle();

  if (jobItemError || !jobItem) {
    throw new Error(`JOB_ITEM_NOT_FOUND: ${jobItemError?.message ?? "Job item does not exist"}`);
  }

  if (jobItem.job_id !== jobId) {
    throw new Error("JOB_ITEM_JOB_MISMATCH: Job item does not belong to the specified job");
  }

  if (!jobItem.is_active) {
    throw new Error("JOB_ITEM_INACTIVE: Job item is not active");
  }

  // Verify job_item_station exists and links the job_item to a station
  const { data: jis, error: jisError } = await supabase
    .from("job_item_steps")
    .select("id, job_item_id")
    .eq("id", jobItemStationId)
    .maybeSingle();

  if (jisError || !jis) {
    throw new Error(`JOB_ITEM_STATION_NOT_FOUND: ${jisError?.message ?? "Job item station does not exist"}`);
  }

  if (jis.job_item_id !== jobItemId) {
    throw new Error("JOB_ITEM_STATION_MISMATCH: Job item station does not match job item");
  }

  // Update the session
  const { data, error } = await supabase
    .from("sessions")
    .update({
      job_id: jobId,
      job_item_id: jobItemId,
      job_item_step_id: jobItemStationId,
    })
    .eq("id", sessionId)
    .eq("status", "active")
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to bind job item to session: ${error.message}`);
  }

  return data as Session;
}

/**
 * Get the WIP accounting for a session (pulled vs originated for both good and scrap).
 * Returns null for legacy sessions without job_item_id.
 */
export async function getSessionWipAccounting(
  sessionId: string,
): Promise<{
  pulled_good: number;
  originated_good: number;
  pulled_scrap: number;
  originated_scrap: number;
} | null> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("v_session_wip_accounting")
    .select("pulled_good, originated_good, pulled_scrap, originated_scrap")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch session WIP accounting: ${error.message}`);
  }

  if (!data) {
    return null; // Legacy session or session not found
  }

  return {
    pulled_good: data.pulled_good as number,
    originated_good: data.originated_good as number,
    pulled_scrap: data.pulled_scrap as number,
    originated_scrap: data.originated_scrap as number,
  };
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
  report_id?: string | null;
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
    p_report_id: payload.report_id ?? null,
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

export type HeartbeatResult =
  | { success: true }
  | { success: false; error: "INSTANCE_MISMATCH" | "SESSION_NOT_FOUND" | "SESSION_NOT_ACTIVE" };

/**
 * Record a heartbeat with instance validation.
 * Returns error if the instance ID doesn't match the session's active instance.
 * This prevents multiple tabs/devices from running the same session.
 */
export async function recordSessionHeartbeatWithInstance(
  sessionId: string,
  instanceId: string,
): Promise<HeartbeatResult> {
  const supabase = createServiceSupabase();
  const timestamp = new Date().toISOString();

  // First, fetch the current session to check instance
  const { data: session, error: fetchError } = await supabase
    .from("sessions")
    .select("id, active_instance_id, status")
    .eq("id", sessionId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to fetch session: ${fetchError.message}`);
  }

  if (!session) {
    return { success: false, error: "SESSION_NOT_FOUND" };
  }

  // If session is no longer active (completed, aborted, force-closed), reject
  // This handles the case where the session was discarded/abandoned
  if (session.status !== "active") {
    return { success: false, error: "SESSION_NOT_ACTIVE" };
  }

  // If session has an active instance and it doesn't match, reject
  if (session.active_instance_id && session.active_instance_id !== instanceId) {
    return { success: false, error: "INSTANCE_MISMATCH" };
  }

  // Update heartbeat and set instance ID if not set
  const { error: updateError } = await supabase
    .from("sessions")
    .update({
      last_seen_at: timestamp,
      active_instance_id: instanceId,
    })
    .eq("id", sessionId);

  if (updateError) {
    throw new Error(`Failed to record session heartbeat: ${updateError.message}`);
  }

  return { success: true };
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
  // total_good/total_scrap removed - derive from status_events
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
      // total_good/total_scrap removed - derive from status_events
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

  const stopStatusId = await getStopStatusId();

  // Use atomic database function to create the final status event
  // This closes open events and mirrors to sessions in a single transaction
  const { error: statusError } = await supabase.rpc("create_status_event_atomic", {
    p_session_id: sessionId,
    p_status_definition_id: stopStatusId,
    p_station_reason_id: null,
    p_note: note,
    p_image_url: null,
    p_report_id: null,
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

// ============================================
// PRODUCTION PIPELINE CONTEXT
// ============================================

export type PipelineNeighborStation = {
  id: string;
  name: string;
  code: string;
  position: number;
  isTerminal: boolean;
  wipAvailable: number;
  occupiedBy: string | null;
};

export type SessionPipelineContext = {
  /** Is this session part of a multi-station pipeline? */
  isProductionLine: boolean;
  /** Is this a single-station pipeline? */
  isSingleStation: boolean;
  /** Current position in the pipeline (1-indexed) */
  currentPosition: number;
  /** Total number of steps in the pipeline */
  totalSteps: number;
  /** Is this the terminal (last) station? */
  isTerminal: boolean;
  /** Previous station in pipeline (null if first) */
  prevStation: PipelineNeighborStation | null;
  /** Next station in pipeline (null if terminal) */
  nextStation: PipelineNeighborStation | null;
  /** WIP available from upstream */
  upstreamWip: number;
  /** Our output waiting for downstream consumption */
  waitingOutput: number;
  /** Job item details */
  jobItem: {
    id: string;
    name: string;
    plannedQuantity: number;
  } | null;
};

/**
 * Get the production pipeline context for a session.
 * Returns information about neighboring stations, WIP balances, and flow state.
 *
 * For sessions without job_item_id (legacy), returns a minimal context.
 */
export async function getSessionPipelineContext(
  sessionId: string,
): Promise<SessionPipelineContext> {
  const supabase = createServiceSupabase();

  // Fetch session with job item details
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select(`
      id,
      job_item_id,
      job_item_step_id,
      station_id
    `)
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    throw new Error(`Failed to fetch session: ${sessionError.message}`);
  }

  if (!session) {
    throw new Error("SESSION_NOT_FOUND");
  }

  // Legacy session without job item - return minimal context
  if (!session.job_item_id || !session.job_item_step_id) {
    return {
      isProductionLine: false,
      isSingleStation: false,
      currentPosition: 1,
      totalSteps: 1,
      isTerminal: true,
      prevStation: null,
      nextStation: null,
      upstreamWip: 0,
      waitingOutput: 0,
      jobItem: null,
    };
  }

  // Fetch job item details
  const { data: jobItem, error: jobItemError } = await supabase
    .from("job_items")
    .select("id, name, planned_quantity")
    .eq("id", session.job_item_id)
    .maybeSingle();

  if (jobItemError || !jobItem) {
    throw new Error(`Failed to fetch job item: ${jobItemError?.message ?? "NOT_FOUND"}`);
  }

  // Fetch current job item station
  const { data: currentJis, error: currentJisError } = await supabase
    .from("job_item_steps")
    .select("id, position, is_terminal")
    .eq("id", session.job_item_step_id)
    .maybeSingle();

  if (currentJisError || !currentJis) {
    throw new Error(`Failed to fetch current station: ${currentJisError?.message ?? "NOT_FOUND"}`);
  }

  const currentPosition = currentJis.position;
  const isTerminal = currentJis.is_terminal;

  // Post Phase 5: all items are pipelines, check if it's a single-step pipeline
  // by looking at total step count
  const { count: stepCount } = await supabase
    .from("job_item_steps")
    .select("*", { count: "exact", head: true })
    .eq("job_item_id", session.job_item_id);

  const isSingleStation = stepCount === 1;

  // For single-station pipelines, return simplified context
  if (isSingleStation) {
    // Get our WIP balance (waiting output)
    const { data: wipBalance } = await supabase
      .from("wip_balances")
      .select("good_available")
      .eq("job_item_step_id", session.job_item_step_id)
      .maybeSingle();

    return {
      isProductionLine: false,
      isSingleStation: true,
      currentPosition: 1,
      totalSteps: 1,
      isTerminal: true,
      prevStation: null,
      nextStation: null,
      upstreamWip: 0,
      waitingOutput: wipBalance?.good_available ?? 0,
      jobItem: {
        id: jobItem.id,
        name: jobItem.name,
        plannedQuantity: jobItem.planned_quantity,
      },
    };
  }

  // Production line - fetch all stations and WIP balances
  const { data: allStations, error: stationsError } = await supabase
    .from("job_item_steps")
    .select(`
      id,
      position,
      is_terminal,
      station_id,
      stations(id, name, code)
    `)
    .eq("job_item_id", session.job_item_id)
    .order("position", { ascending: true });

  if (stationsError) {
    throw new Error(`Failed to fetch stations: ${stationsError.message}`);
  }

  // Fetch all WIP balances for this job item
  const { data: wipBalances, error: wipError } = await supabase
    .from("wip_balances")
    .select("job_item_step_id, good_available")
    .eq("job_item_id", session.job_item_id);

  if (wipError) {
    throw new Error(`Failed to fetch WIP balances: ${wipError.message}`);
  }

  // Create a map of station ID -> WIP balance
  const wipMap = new Map<string, number>();
  for (const wip of wipBalances ?? []) {
    wipMap.set(wip.job_item_step_id, wip.good_available);
  }

  // Find active workers at stations
  const stationIds = (allStations ?? []).map((s) => s.station_id);
  const { data: activeSessions } = await supabase
    .from("sessions")
    .select(`
      station_id,
      workers:worker_id(full_name)
    `)
    .in("station_id", stationIds)
    .eq("status", "active")
    .neq("id", sessionId);

  // Map station_id -> worker name
  const occupancyMap = new Map<string, string>();
  for (const sess of activeSessions ?? []) {
    // Supabase single-relation join returns object, not array
    const workerData = sess.workers as unknown as { full_name: string } | null;
    if (workerData?.full_name) {
      occupancyMap.set(sess.station_id, workerData.full_name);
    }
  }

  // Find previous and next stations
  let prevStation: PipelineNeighborStation | null = null;
  let nextStation: PipelineNeighborStation | null = null;
  let upstreamWip = 0;
  let waitingOutput = 0;

  for (const jis of allStations ?? []) {
    // Supabase single-relation join returns object, not array
    const station = jis.stations as unknown as { id: string; name: string; code: string } | null;
    if (!station) continue;

    const wipAvailable = wipMap.get(jis.id) ?? 0;

    if (jis.position === currentPosition - 1) {
      // Previous station
      prevStation = {
        id: station.id,
        name: station.name,
        code: station.code,
        position: jis.position,
        isTerminal: jis.is_terminal,
        wipAvailable,
        occupiedBy: occupancyMap.get(station.id) ?? null,
      };
      upstreamWip = wipAvailable;
    } else if (jis.position === currentPosition + 1) {
      // Next station
      nextStation = {
        id: station.id,
        name: station.name,
        code: station.code,
        position: jis.position,
        isTerminal: jis.is_terminal,
        wipAvailable,
        occupiedBy: occupancyMap.get(station.id) ?? null,
      };
    } else if (jis.id === session.job_item_step_id) {
      // Current station - our waiting output is our WIP balance
      waitingOutput = wipAvailable;
    }
  }

  return {
    isProductionLine: true,
    isSingleStation: false,
    currentPosition,
    totalSteps: stepCount ?? 1,
    isTerminal,
    prevStation,
    nextStation,
    upstreamWip,
    waitingOutput,
    jobItem: {
      id: jobItem.id,
      name: jobItem.name,
      plannedQuantity: jobItem.planned_quantity,
    },
  };
}
