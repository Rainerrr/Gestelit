import { createServiceSupabase } from "@/lib/supabase/client";
import { subDays } from "date-fns";
import type {
  Job,
  JobItemDistribution,
  JobItemDistributionPeriod,
  JobItemWithDetails,
  LiveJobProgress,
  MachineState,
  SessionStatus,
  Station,
  StationType,
  StatusEventState,
  WipStationData,
} from "@/lib/types";

/** Raw status event shape needed by computeJobItemDistribution */
export type DistributionEvent = {
  job_item_id: string | null;
  started_at: string;
  ended_at: string | null;
  job_items?: { name: string; jobs?: { job_number: string } | null } | null;
};

/**
 * Merges consecutive status events with the same job_item_id into contiguous periods.
 * Events with null job_item_id close the current period (gap).
 */
export const computeJobItemDistribution = (
  sessionId: string,
  events: DistributionEvent[],
): JobItemDistribution => {
  const periods: JobItemDistributionPeriod[] = [];
  let current: JobItemDistributionPeriod | null = null;

  for (const event of events) {
    const endedAt = event.ended_at;

    if (!event.job_item_id) {
      // Null job item — close current period
      if (current) {
        current.endedAt = event.started_at;
        current.durationSeconds = Math.floor(
          (new Date(current.endedAt).getTime() - new Date(current.startedAt).getTime()) / 1000,
        );
        periods.push(current);
        current = null;
      }
      continue;
    }

    if (current && current.jobItemId === event.job_item_id) {
      // Same job item — extend period
      current.endedAt = endedAt;
      current.durationSeconds = endedAt
        ? Math.floor((new Date(endedAt).getTime() - new Date(current.startedAt).getTime()) / 1000)
        : 0;
    } else {
      // Different job item — close previous, start new
      if (current) {
        current.endedAt = event.started_at;
        current.durationSeconds = Math.floor(
          (new Date(current.endedAt).getTime() - new Date(current.startedAt).getTime()) / 1000,
        );
        periods.push(current);
      }
      current = {
        jobItemId: event.job_item_id,
        jobItemName: event.job_items?.name ?? "לא ידוע",
        jobNumber: event.job_items?.jobs?.job_number ?? "לא ידוע",
        startedAt: event.started_at,
        endedAt: endedAt,
        durationSeconds: endedAt
          ? Math.floor((new Date(endedAt).getTime() - new Date(event.started_at).getTime()) / 1000)
          : 0,
      };
    }
  }

  // Push final period
  if (current) {
    periods.push(current);
  }

  return { sessionId, periods };
};

export type CurrentJobItemInfo = {
  jobItemId: string;
  jobItemName: string;
  plannedQuantity: number;
  /** Total completed across all sessions (from job_item_progress) */
  totalCompletedGood: number;
  /** Total scrap across all sessions */
  totalCompletedScrap: number;
  /** Quantity reported in this session only */
  sessionGood: number;
  /** Scrap reported in this session only */
  sessionScrap: number;
};

export type ActiveSession = {
  id: string;
  jobId: string;
  jobNumber: string;
  stationId: string | null;
  stationName: string;
  stationType: StationType | null;
  workerId: string;
  workerName: string;
  status: SessionStatus;
  currentStatus: StatusEventState | null;
  lastStatusChangeAt: string;
  startedAt: string;
  totalGood: number;
  totalScrap: number;
  forcedClosedAt: string | null;
  lastEventNote: string | null;
  lastSeenAt: string | null;
  malfunctionCount: number;
  stoppageTimeSeconds: number;
  setupTimeSeconds: number;
  /** Current job item being worked on (from latest status event) */
  currentJobItem: CurrentJobItemInfo | null;
  /** Accumulated job item timer seconds (from completed status events) */
  jobItemTimerAccumulatedSeconds: number;
  /** ISO timestamp of when current job item segment started (for live timer) */
  currentJobItemStartedAt: string | null;
};

export type CompletedSession = ActiveSession & {
  endedAt: string;
  durationSeconds: number;
  stoppageTimeSeconds: number;
  setupTimeSeconds: number;
  productionTimeSeconds: number;
  jobItemCount: number;
  jobItemNames: string[];
};

type SessionRow = {
  id: string;
  worker_id: string | null;
  station_id: string | null;
  job_id: string;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  // total_good/total_scrap removed - derive from status_events
  forced_closed_at: string | null;
};

type RawActiveSession = SessionRow & {
  current_status_id?: StatusEventState | null;
  current_status_code?: StatusEventState | null;
  last_status_change_at: string | null;
  last_seen_at: string | null;
  jobs: { job_number: string | null } | null;
  stations: { name: string | null; station_type: StationType | null } | null;
  workers: { full_name: string | null } | null;
  worker_full_name_snapshot: string | null;
  worker_code_snapshot: string | null;
  station_name_snapshot: string | null;
  station_code_snapshot: string | null;
};

const ACTIVE_SESSIONS_SELECT = `
  id,
  worker_id,
  station_id,
  job_id,
  status,
  started_at,
  ended_at,
  current_status_id,
  last_status_change_at,
  last_seen_at,
  forced_closed_at,
  worker_full_name_snapshot,
  worker_code_snapshot,
  station_name_snapshot,
  station_code_snapshot,
  jobs:jobs(job_number),
  stations:stations(name, station_type),
  workers:workers(full_name)
`;

const LEGACY_ACTIVE_SESSIONS_SELECT = `
  id,
  worker_id,
  station_id,
  job_id,
  status,
  started_at,
  ended_at,
  current_status_code,
  last_status_change_at,
  last_seen_at,
  forced_closed_at,
  worker_full_name_snapshot,
  worker_code_snapshot,
  station_name_snapshot,
  station_code_snapshot,
  jobs:jobs(job_number),
  stations:stations(name, station_type),
  workers:workers(full_name)
`;

const mapActiveSession = (
  row: RawActiveSession,
  lastEventNote: string | null = null,
  malfunctionCount: number = 0,
  stoppageTimeSeconds: number = 0,
  setupTimeSeconds: number = 0,
  derivedTotals?: { totalGood: number; totalScrap: number },
  currentJobItem?: CurrentJobItemInfo | null,
  jobItemTimerData?: { accumulatedSeconds: number; segmentStart: string | null },
): ActiveSession => ({
  id: row.id,
  jobId: row.job_id,
  jobNumber: row.jobs?.job_number ?? "לא ידוע",
  stationId: row.station_id ?? null,
  stationName: row.stations?.name ?? row.station_name_snapshot ?? "לא משויך",
  stationType: row.stations?.station_type ?? null,
  workerId: row.worker_id ?? "",
  workerName: row.workers?.full_name ?? row.worker_full_name_snapshot ?? "לא משויך",
  status: row.status,
  currentStatus:
    row.current_status_id ??
    row.current_status_code ??
    null,
  lastStatusChangeAt: row.last_status_change_at ?? row.started_at,
  startedAt: row.started_at,
  totalGood: derivedTotals?.totalGood ?? 0,
  totalScrap: derivedTotals?.totalScrap ?? 0,
  forcedClosedAt: row.forced_closed_at,
  lastEventNote,
  lastSeenAt: row.last_seen_at,
  malfunctionCount,
  stoppageTimeSeconds,
  setupTimeSeconds,
  currentJobItem: currentJobItem ?? null,
  jobItemTimerAccumulatedSeconds: jobItemTimerData?.accumulatedSeconds ?? 0,
  currentJobItemStartedAt: jobItemTimerData?.segmentStart ?? null,
});

/**
 * Fetch malfunction report counts for multiple sessions
 * Counts malfunction reports linked via session_id FK
 */
export const fetchMalfunctionCountsBySessionIds = async (
  sessionIds: string[],
): Promise<Map<string, number>> => {
  if (sessionIds.length === 0) {
    return new Map();
  }

  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("reports")
    .select("session_id")
    .eq("type", "malfunction")
    .in("session_id", sessionIds);

  if (error) {
    console.error("[admin-dashboard] Failed to fetch malfunction counts", error);
    return new Map();
  }

  const countMap = new Map<string, number>();
  for (const row of data ?? []) {
    if (row.session_id) {
      countMap.set(row.session_id, (countMap.get(row.session_id) ?? 0) + 1);
    }
  }
  return countMap;
};

/**
 * Fetch derived totals (totalGood, totalScrap) for multiple sessions.
 * Uses v_session_derived_totals view which sums ALL status_events for each session
 * (across all job items and pipeline steps). This gives the full session-level
 * production total used by the KPI cards on the admin dashboard.
 */
const fetchDerivedTotalsBySessionIds = async (
  sessionIds: string[],
): Promise<Map<string, { totalGood: number; totalScrap: number }>> => {
  if (sessionIds.length === 0) {
    return new Map();
  }

  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("v_session_derived_totals")
    .select("session_id, total_good, total_scrap")
    .in("session_id", sessionIds);

  if (error) {
    console.error("[admin-dashboard] Failed to fetch derived totals", error);
    return new Map();
  }

  const totalsMap = new Map<string, { totalGood: number; totalScrap: number }>();
  for (const row of data ?? []) {
    if (row.session_id) {
      totalsMap.set(row.session_id, {
        totalGood: row.total_good ?? 0,
        totalScrap: row.total_scrap ?? 0,
      });
    }
  }
  return totalsMap;
};

/**
 * Fetch current job item info for multiple sessions.
 *
 * Reads the *live* binding from sessions.job_item_id / sessions.job_item_step_id
 * rather than from the latest status event. This is critical after unbind:
 * an unbind leaves the previous status_event rows untouched (still stamped
 * with the old job_item_id), so a query that inspects status_events would
 * return stale "current" data. The sessions row is the single source of
 * truth for what the worker is *currently* bound to.
 *
 * Progress totals are still aggregated from status_events by the live
 * job_item_step_id so multi-step pipelines stay scoped per step.
 */
const fetchCurrentJobItemBySessionIds = async (
  sessionIds: string[],
): Promise<Map<string, CurrentJobItemInfo>> => {
  if (sessionIds.length === 0) {
    return new Map();
  }

  const supabase = createServiceSupabase();

  // Read the live binding directly from the sessions table
  const { data: sessionBindings, error: bindingError } = await supabase
    .from("sessions")
    .select(`
      id,
      job_item_id,
      job_item_step_id,
      job_items:job_item_id(
        id,
        name,
        planned_quantity
      )
    `)
    .in("id", sessionIds)
    .not("job_item_id", "is", null);

  if (bindingError) {
    console.error("[admin-dashboard] Failed to fetch current job items", bindingError);
    return new Map();
  }

  type SessionBindingRow = {
    id: string;
    job_item_id: string;
    job_item_step_id: string | null;
    job_items: {
      id: string;
      name: string;
      planned_quantity: number;
    } | null;
  };

  const sessionLatest = new Map<
    string,
    { session_id: string; job_item_id: string; job_item_step_id: string | null; job_items: SessionBindingRow["job_items"] }
  >();
  for (const row of (sessionBindings as unknown as SessionBindingRow[]) ?? []) {
    if (!row.id || !row.job_item_id || !row.job_items) continue;
    sessionLatest.set(row.id, {
      session_id: row.id,
      job_item_id: row.job_item_id,
      job_item_step_id: row.job_item_step_id,
      job_items: row.job_items,
    });
  }

  // Collect unique step IDs to fetch per-step totals
  const stepIds = new Set<string>();
  for (const event of sessionLatest.values()) {
    if (event.job_item_step_id) {
      stepIds.add(event.job_item_step_id);
    }
  }

  // Fetch quantities scoped to the specific steps (good + scrap)
  const stepGoodTotals = new Map<string, number>();
  const stepScrapTotals = new Map<string, number>();
  const sessionStepGoodTotals = new Map<string, Map<string, number>>();
  const sessionStepScrapTotals = new Map<string, Map<string, number>>();

  if (stepIds.size > 0) {
    const { data: allStepTotals, error: allTotalsError } = await supabase
      .from("status_events")
      .select("job_item_step_id, session_id, quantity_good, quantity_scrap")
      .in("job_item_step_id", Array.from(stepIds));

    if (allTotalsError) {
      console.error("[admin-dashboard] Failed to fetch step totals", allTotalsError);
    }

    for (const row of allStepTotals ?? []) {
      if (!row.job_item_step_id) continue;
      const good = row.quantity_good ?? 0;
      const scrap = row.quantity_scrap ?? 0;
      if (good === 0 && scrap === 0) continue;

      // Total for step (across all sessions)
      if (good > 0) {
        stepGoodTotals.set(row.job_item_step_id, (stepGoodTotals.get(row.job_item_step_id) ?? 0) + good);
      }
      if (scrap > 0) {
        stepScrapTotals.set(row.job_item_step_id, (stepScrapTotals.get(row.job_item_step_id) ?? 0) + scrap);
      }

      // Per-session step totals
      if (row.session_id) {
        if (good > 0) {
          let stepMap = sessionStepGoodTotals.get(row.session_id);
          if (!stepMap) {
            stepMap = new Map();
            sessionStepGoodTotals.set(row.session_id, stepMap);
          }
          stepMap.set(row.job_item_step_id, (stepMap.get(row.job_item_step_id) ?? 0) + good);
        }
        if (scrap > 0) {
          let stepMap = sessionStepScrapTotals.get(row.session_id);
          if (!stepMap) {
            stepMap = new Map();
            sessionStepScrapTotals.set(row.session_id, stepMap);
          }
          stepMap.set(row.job_item_step_id, (stepMap.get(row.job_item_step_id) ?? 0) + scrap);
        }
      }
    }
  }

  // Build result map
  const result = new Map<string, CurrentJobItemInfo>();

  for (const [sessionId, event] of sessionLatest) {
    const stepId = event.job_item_step_id;
    const sessionGood = stepId
      ? (sessionStepGoodTotals.get(sessionId)?.get(stepId) ?? 0)
      : 0;
    const sessionScrap = stepId
      ? (sessionStepScrapTotals.get(sessionId)?.get(stepId) ?? 0)
      : 0;
    const totalCompletedGood = stepId
      ? (stepGoodTotals.get(stepId) ?? 0)
      : 0;
    const totalCompletedScrap = stepId
      ? (stepScrapTotals.get(stepId) ?? 0)
      : 0;

    result.set(sessionId, {
      jobItemId: event.job_item_id,
      jobItemName: event.job_items!.name,
      plannedQuantity: event.job_items!.planned_quantity,
      totalCompletedGood,
      totalCompletedScrap,
      sessionGood,
      sessionScrap,
    });
  }

  return result;
};

/**
 * Fetch job item timer data for multiple sessions.
 * Returns accumulated seconds from completed status events and current segment start.
 * Uses a batch query with GROUP BY for efficiency.
 */
export const fetchJobItemTimerDataBySessionIds = async (
  sessionIds: string[],
): Promise<Map<string, { accumulatedSeconds: number; segmentStart: string | null }>> => {
  const timerMap = new Map<string, { accumulatedSeconds: number; segmentStart: string | null }>();
  if (sessionIds.length === 0) return timerMap;

  const supabase = createServiceSupabase();

  // Fetch sessions with current job item to know which job items are active
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, job_item_id, current_job_item_started_at")
    .in("id", sessionIds)
    .not("job_item_id", "is", null);

  if (!sessions?.length) return timerMap;

  // Build a map of session -> job_item_id for the batch query
  const sessionJobMap = new Map<string, { jobItemId: string; segmentStart: string | null }>();
  for (const s of sessions) {
    sessionJobMap.set(s.id, {
      jobItemId: s.job_item_id,
      segmentStart: s.current_job_item_started_at ?? null,
    });
  }

  // Batch query: get accumulated seconds per session for their current job item
  const sessionIdsWithJobs = Array.from(sessionJobMap.keys());
  const { data: events } = await supabase
    .from("status_events")
    .select("session_id, job_item_id, started_at, ended_at")
    .in("session_id", sessionIdsWithJobs)
    .not("ended_at", "is", null);

  // Compute accumulated seconds per session (only for their current job item)
  const accumulatedMap = new Map<string, number>();
  for (const event of events ?? []) {
    const sessionJobInfo = sessionJobMap.get(event.session_id);
    if (!sessionJobInfo || event.job_item_id !== sessionJobInfo.jobItemId) continue;

    const start = new Date(event.started_at).getTime();
    const end = new Date(event.ended_at).getTime();
    const seconds = Math.max(0, (end - start) / 1000);
    accumulatedMap.set(event.session_id, (accumulatedMap.get(event.session_id) ?? 0) + seconds);
  }

  // Build result map
  for (const [sessionId, jobInfo] of sessionJobMap) {
    timerMap.set(sessionId, {
      accumulatedSeconds: Math.floor(accumulatedMap.get(sessionId) ?? 0),
      segmentStart: jobInfo.segmentStart,
    });
  }

  return timerMap;
};

export const fetchActiveSessions = async (): Promise<ActiveSession[]> => {
  const supabase = createServiceSupabase();

  const runQuery = async (select: string) =>
    supabase
      .from("sessions")
      .select(select)
      .eq("status", "active")
      .is("ended_at", null)
      .order("started_at", { ascending: false });

  const { data, error } = await runQuery(ACTIVE_SESSIONS_SELECT);

  let rows = (data as unknown as RawActiveSession[]) ?? null;

  if (error) {
    console.error("[admin-dashboard] Active sessions fetch failed (new schema)", error);
    const legacyResult = await runQuery(LEGACY_ACTIVE_SESSIONS_SELECT);
    if (legacyResult.error) {
      console.error(
        "[admin-dashboard] Active sessions fetch failed (legacy schema)",
        legacyResult.error,
      );
      return [];
    }
    const legacyRows = (legacyResult.data as unknown as RawActiveSession[]) ?? null;
    rows = legacyRows;
  }

  if (!rows) {
    return [];
  }

  console.log(
    `[admin-dashboard] Fetched ${rows.length} active sessions`,
    rows.map((r) => ({ id: r.id, status: r.status, ended_at: r.ended_at })),
  );

  // Fetch malfunction counts, stoppage times, setup times, derived totals, current job items, and timer data (in parallel)
  const sessionIds = rows.map((row) => row.id);
  const [malfunctionCounts, stoppageTimes, setupTimes, derivedTotals, currentJobItems, jobItemTimers] = await Promise.all([
    fetchMalfunctionCountsBySessionIds(sessionIds),
    fetchStoppageTimeBySessionIds(sessionIds),
    fetchSetupTimeBySessionIds(sessionIds),
    fetchDerivedTotalsBySessionIds(sessionIds),
    fetchCurrentJobItemBySessionIds(sessionIds),
    fetchJobItemTimerDataBySessionIds(sessionIds),
  ]);

  return rows.map((row) =>
    mapActiveSession(
      row,
      null,
      malfunctionCounts.get(row.id) ?? 0,
      stoppageTimes.get(row.id) ?? 0,
      setupTimes.get(row.id) ?? 0,
      derivedTotals.get(row.id),
      currentJobItems.get(row.id),
      jobItemTimers.get(row.id),
    ),
  );
};

/**
 * Optimized version using RPC to fetch all enrichment data in single query.
 * Use this for better performance at scale (50+ concurrent workers).
 * Falls back to fetchActiveSessions if RPC is not available.
 */
export const fetchActiveSessionsEnriched = async (): Promise<ActiveSession[]> => {
  const supabase = createServiceSupabase();

  // Type for RPC result row
  type EnrichedRow = {
    session_id: string;
    worker_id: string | null;
    worker_full_name: string | null;
    worker_code: string | null;
    station_id: string | null;
    station_name: string | null;
    station_code: string | null;
    station_type: string | null;
    job_id: string | null;
    job_number: string | null;
    job_item_id: string | null;
    job_item_name: string | null;
    job_item_step_id: string | null;
    current_status_id: string | null;
    status_name: string | null;
    status_color: string | null;
    machine_state: string | null;
    started_at: string;
    last_status_change_at: string | null;
    last_seen_at: string | null;
    malfunction_count: number;
    stoppage_seconds: number;
    setup_seconds: number;
    production_seconds: number;
    total_good: number;
    total_scrap: number;
    current_job_item_good: number;
    current_job_item_scrap: number;
  };

  const { data, error } = await supabase.rpc("get_active_sessions_enriched");

  if (error) {
    console.error("[admin-dashboard] Enriched RPC failed, falling back to standard fetch", error);
    // Fallback to the original multi-query approach
    return fetchActiveSessions();
  }

  const rows = (data as EnrichedRow[]) ?? [];

  console.log(`[admin-dashboard] Fetched ${rows.length} active sessions (enriched RPC)`);

  // Map RPC result to ActiveSession type
  return rows.map((row): ActiveSession => ({
    id: row.session_id,
    jobId: row.job_id ?? "",
    jobNumber: row.job_number ?? "",
    stationId: row.station_id,
    stationName: row.station_name ?? "Unknown",
    stationType: row.station_type as StationType | null,
    workerId: row.worker_id ?? "",
    workerName: row.worker_full_name ?? "Unknown",
    status: "active" as SessionStatus,
    currentStatus: row.current_status_id as StatusEventState | null,
    lastStatusChangeAt: row.last_status_change_at ?? row.started_at,
    startedAt: row.started_at,
    totalGood: row.total_good,
    totalScrap: row.total_scrap,
    forcedClosedAt: null,
    lastEventNote: null,  // Not included in RPC for simplicity
    lastSeenAt: row.last_seen_at,
    malfunctionCount: row.malfunction_count,
    stoppageTimeSeconds: row.stoppage_seconds,
    setupTimeSeconds: row.setup_seconds,
    currentJobItem: row.job_item_id ? {
      jobItemId: row.job_item_id,
      jobItemName: row.job_item_name ?? "",
      plannedQuantity: 0,  // Would need additional join for this
      totalCompletedGood: 0,  // Would need additional join for this
      totalCompletedScrap: 0,
      sessionGood: row.current_job_item_good,
      sessionScrap: 0,
    } : null,
    jobItemTimerAccumulatedSeconds: 0,  // Not available from enriched RPC
    currentJobItemStartedAt: null,  // Not available from enriched RPC
  }));
};

export const fetchActiveSessionById = async (
  sessionId: string,
): Promise<ActiveSession | null> => {
  if (!sessionId) {
    return null;
  }

  const supabase = createServiceSupabase();

  const runQuery = async (select: string) =>
    supabase
      .from("sessions")
      .select(select)
      .eq("id", sessionId)
      .eq("status", "active")
      .is("ended_at", null)
      .maybeSingle();

  const { data, error } = await runQuery(ACTIVE_SESSIONS_SELECT);

  let row = (data as unknown as RawActiveSession | null) ?? null;

  if (error) {
    console.error(
      `[admin-dashboard] Active session fetch failed for ${sessionId} (new schema)`,
      error,
    );
    const legacyResult = await runQuery(LEGACY_ACTIVE_SESSIONS_SELECT);
    if (legacyResult.error) {
      console.error(
        `[admin-dashboard] Active session fetch failed for ${sessionId} (legacy schema)`,
        legacyResult.error,
      );
      return null;
    }
    row = (legacyResult.data as unknown as RawActiveSession | null) ?? null;
  }

  if (!row) {
    return null;
  }

  // Fetch malfunction count, stoppage time, setup time, derived totals, current job item, and timer data (in parallel)
  const [malfunctionCounts, stoppageTimes, setupTimes, derivedTotals, currentJobItems, jobItemTimers] = await Promise.all([
    fetchMalfunctionCountsBySessionIds([row.id]),
    fetchStoppageTimeBySessionIds([row.id]),
    fetchSetupTimeBySessionIds([row.id]),
    fetchDerivedTotalsBySessionIds([row.id]),
    fetchCurrentJobItemBySessionIds([row.id]),
    fetchJobItemTimerDataBySessionIds([row.id]),
  ]);

  return mapActiveSession(
    row,
    null,
    malfunctionCounts.get(row.id) ?? 0,
    stoppageTimes.get(row.id) ?? 0,
    setupTimes.get(row.id) ?? 0,
    derivedTotals.get(row.id),
    currentJobItems.get(row.id),
    jobItemTimers.get(row.id),
  );
};

// Note: Realtime subscriptions need browser client, but this is only used client-side
// For admin dashboard, we'll use polling instead of realtime
export const subscribeToActiveSessions = (
  onRefresh: () => void | Promise<void>,
) => {
  // This function is deprecated for admin use - use API polling instead
  // Keeping for backward compatibility but it won't work with RLS
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getBrowserSupabaseClient } = require("@/lib/supabase/client");
  const supabase = getBrowserSupabaseClient();
  const channel = supabase
    .channel("admin-active-sessions")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "sessions" },
      (payload: { new: unknown }) => {
        console.log("[admin-realtime] INSERT event", payload.new);
        void onRefresh();
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "sessions" },
      (payload: { old: unknown; new: unknown }) => {
        console.log("[admin-realtime] UPDATE event", {
          old: payload.old,
          new: payload.new,
        });
        void onRefresh();
      },
    )
    .subscribe((status: string, err: unknown) => {
      console.log("[admin-realtime] Subscription status:", status, err);
    });

  return () => {
    console.log("[admin-realtime] Unsubscribing");
    void supabase.removeChannel(channel);
  };
};

const fetchLastEventNote = async (sessionId: string): Promise<string | null> => {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("status_events")
    .select("note")
    .eq("session_id", sessionId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.note;
};

/**
 * Generic function to fetch total time spent in specific machine states for sessions.
 * @param sessionIds - Array of session IDs to calculate time for
 * @param machineStates - Array of machine states to filter by (e.g., ['stoppage'], ['setup'])
 * @returns Map of sessionId -> total seconds spent in the specified states
 */
const fetchMachineStateTimeBySessionIds = async (
  sessionIds: string[],
  machineStates: MachineState[],
): Promise<Map<string, number>> => {
  if (sessionIds.length === 0 || machineStates.length === 0) {
    return new Map();
  }

  const supabase = createServiceSupabase();

  // Fetch status events with their status definition's machine_state
  const { data, error } = await supabase
    .from("status_events")
    .select(`
      session_id,
      started_at,
      ended_at,
      status_definitions!inner(machine_state)
    `)
    .in("session_id", sessionIds)
    .in("status_definitions.machine_state", machineStates);

  if (error) {
    console.error(`[admin-dashboard] Failed to fetch ${machineStates.join("/")} events`, error);
    return new Map();
  }

  type MachineStateEventRow = {
    session_id: string;
    started_at: string;
    ended_at: string | null;
    status_definitions: { machine_state: MachineState } | null;
  };

  const rows = (data as unknown as MachineStateEventRow[]) ?? [];
  const timeMap = new Map<string, number>();

  const nowTs = Date.now();

  rows.forEach((row) => {
    if (!row.status_definitions?.machine_state) {
      return;
    }

    const startTs = new Date(row.started_at).getTime();
    const endTs = row.ended_at ? new Date(row.ended_at).getTime() : nowTs;
    const durationMs = Math.max(0, endTs - startTs);
    const durationSeconds = Math.floor(durationMs / 1000);

    const current = timeMap.get(row.session_id) ?? 0;
    timeMap.set(row.session_id, current + durationSeconds);
  });

  return timeMap;
};

/**
 * Fetch stoppage time for multiple sessions.
 * Convenience wrapper for fetchMachineStateTimeBySessionIds.
 */
const fetchStoppageTimeBySessionIds = (sessionIds: string[]) =>
  fetchMachineStateTimeBySessionIds(sessionIds, ["stoppage"]);

/**
 * Fetch setup time for multiple sessions.
 * Convenience wrapper for fetchMachineStateTimeBySessionIds.
 */
const fetchSetupTimeBySessionIds = (sessionIds: string[]) =>
  fetchMachineStateTimeBySessionIds(sessionIds, ["setup"]);

/**
 * Fetch production time for multiple sessions.
 * Convenience wrapper for fetchMachineStateTimeBySessionIds.
 */
const fetchProductionTimeBySessionIds = (sessionIds: string[]) =>
  fetchMachineStateTimeBySessionIds(sessionIds, ["production"]);

/**
 * Fetch derived totals (totalGood, totalScrap) across ALL job items for sessions.
 * Uses v_session_derived_totals view which sums from all status_events for the session.
 * Unlike fetchDerivedTotalsBySessionIds (current job item only), this gives full history.
 */
const fetchAllDerivedTotalsBySessionIds = async (
  sessionIds: string[],
): Promise<Map<string, { totalGood: number; totalScrap: number }>> => {
  if (sessionIds.length === 0) {
    return new Map();
  }

  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("v_session_derived_totals")
    .select("session_id, total_good, total_scrap")
    .in("session_id", sessionIds);

  if (error) {
    console.error("[admin-dashboard] Failed to fetch all derived totals", error);
    return new Map();
  }

  const totalsMap = new Map<string, { totalGood: number; totalScrap: number }>();
  for (const row of data ?? []) {
    if (row.session_id) {
      totalsMap.set(row.session_id, {
        totalGood: row.total_good ?? 0,
        totalScrap: row.total_scrap ?? 0,
      });
    }
  }
  return totalsMap;
};

/**
 * Fetch number of distinct job items worked on per session.
 * Counts distinct job_item_id from status_events where quantity_good > 0.
 */
const fetchJobItemCountBySessionIds = async (
  sessionIds: string[],
): Promise<Map<string, number>> => {
  if (sessionIds.length === 0) {
    return new Map();
  }

  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("status_events")
    .select("session_id, job_item_id")
    .in("session_id", sessionIds)
    .not("job_item_id", "is", null)
    .gt("quantity_good", 0);

  if (error) {
    console.error("[admin-dashboard] Failed to fetch job item counts", error);
    return new Map();
  }

  const countMap = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    if (row.session_id && row.job_item_id) {
      const existing = countMap.get(row.session_id) ?? new Set();
      existing.add(row.job_item_id);
      countMap.set(row.session_id, existing);
    }
  }

  const result = new Map<string, number>();
  countMap.forEach((set, sessionId) => {
    result.set(sessionId, set.size);
  });
  return result;
};

/**
 * Fetch distinct job item names per session (for tooltip display).
 * Returns names of job items that had quantity_good > 0 reported.
 */
const fetchJobItemNamesBySessionIds = async (
  sessionIds: string[],
): Promise<Map<string, string[]>> => {
  if (sessionIds.length === 0) {
    return new Map();
  }

  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("status_events")
    .select("session_id, job_item_id, job_items:job_item_id(name)")
    .in("session_id", sessionIds)
    .not("job_item_id", "is", null)
    .gt("quantity_good", 0);

  if (error) {
    console.error("[admin-dashboard] Failed to fetch job item names", error);
    return new Map();
  }

  type JobItemNameRow = {
    session_id: string;
    job_item_id: string;
    job_items: { name: string } | null;
  };

  const namesMap = new Map<string, Map<string, string>>();
  for (const row of (data as unknown as JobItemNameRow[]) ?? []) {
    if (row.session_id && row.job_item_id && row.job_items?.name) {
      const existing = namesMap.get(row.session_id) ?? new Map();
      existing.set(row.job_item_id, row.job_items.name);
      namesMap.set(row.session_id, existing);
    }
  }

  const result = new Map<string, string[]>();
  namesMap.forEach((nameMap, sessionId) => {
    result.set(sessionId, Array.from(nameMap.values()));
  });
  return result;
};

export type FetchRecentSessionsArgs = {
  workerId?: string;
  stationId?: string;
  jobNumber?: string;
  limit?: number;
  /** Date range start - defaults to 90 days ago */
  since?: Date;
  /** Date range end - defaults to now */
  until?: Date;
};

export const fetchRecentSessions = async (
  args: FetchRecentSessionsArgs = {},
): Promise<CompletedSession[]> => {
  const {
    workerId,
    stationId,
    jobNumber,
    limit = 50,  // Increased default from 8 to 50 with date filtering
    since = subDays(new Date(), 90),  // Default: last 90 days
    until,
  } = args;
  const supabase = createServiceSupabase();

  // Use !inner join on jobs when filtering by jobNumber so PostgREST
  // excludes sessions that don't match (default left join only filters
  // the embedded object, not the parent row).
  const selectStr = jobNumber
    ? ACTIVE_SESSIONS_SELECT.replace("jobs:jobs(", "jobs:jobs!inner(")
    : ACTIVE_SESSIONS_SELECT;

  let query = supabase
    .from("sessions")
    .select(selectStr)
    .not("ended_at", "is", null)
    .gte("ended_at", since.toISOString())  // Date range filter for scale
    .order("ended_at", { ascending: false })
    .limit(limit);

  if (until) {
    query = query.lte("ended_at", until.toISOString());
  }

  if (workerId) {
    query = query.eq("worker_id", workerId);
  }

  if (stationId) {
    query = query.eq("station_id", stationId);
  }

  if (jobNumber) {
    query = query.eq("jobs.job_number", jobNumber);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[admin-dashboard] Failed to fetch recent sessions", error);
    return [];
  }

  const rows = (data as unknown as RawActiveSession[]) ?? [];

  // Fetch all enrichment data in parallel
  const sessionIds = rows.map((row) => row.id);
  const [stoppageMap, setupMap, productionMap, malfunctionCountMap, allDerivedTotals, jobItemCounts, jobItemNames] = await Promise.all([
    fetchStoppageTimeBySessionIds(sessionIds),
    fetchSetupTimeBySessionIds(sessionIds),
    fetchProductionTimeBySessionIds(sessionIds),
    fetchMalfunctionCountsBySessionIds(sessionIds),
    fetchAllDerivedTotalsBySessionIds(sessionIds),
    fetchJobItemCountBySessionIds(sessionIds),
    fetchJobItemNamesBySessionIds(sessionIds),
  ]);

  const sessionsWithNotes = await Promise.all(
    rows.map(async (row) => {
      const lastEventNote = await fetchLastEventNote(row.id);
      const malfunctionCount = malfunctionCountMap.get(row.id) ?? 0;
      const totals = allDerivedTotals.get(row.id);
      const base = mapActiveSession(row, lastEventNote, malfunctionCount, 0, 0, totals);
      const endedAt = row.ended_at ?? row.started_at;
      const durationSeconds = Math.max(
        0,
        Math.floor(
          (new Date(endedAt).getTime() - new Date(row.started_at).getTime()) /
            1000,
        ),
      );
      const stoppageTimeSeconds = stoppageMap.get(row.id) ?? 0;
      const setupTimeSeconds = setupMap.get(row.id) ?? 0;
      const productionTimeSeconds = productionMap.get(row.id) ?? 0;

      return {
        ...base,
        endedAt,
        durationSeconds,
        stoppageTimeSeconds,
        setupTimeSeconds,
        productionTimeSeconds,
        jobItemCount: jobItemCounts.get(row.id) ?? 0,
        jobItemNames: jobItemNames.get(row.id) ?? [],
      };
    }),
  );

  return sessionsWithNotes;
};

type StatusEventRow = {
  session_id: string;
  id: string;
  status_definition_id?: StatusEventState;
  status_code?: StatusEventState;
  started_at: string;
  ended_at: string | null;
  sessions?: { station_id: string | null } | null;
  status_definitions?: { report_type: string | null } | null;
  // Production data
  job_item_id?: string | null;
  quantity_good?: number | null;
  job_items?: { name: string; jobs: { job_number: string } | null } | null;
};

type ReportForStatusEvent = {
  status_event_id: string;
  type: string;
  report_reasons?: { label_he: string | null } | null;
  stations?: { station_reasons: { id: string; label_he: string; label_ru: string }[] | null } | null;
  station_reason_id?: string | null;
};

export type SessionStatusEvent = {
  sessionId: string;
  statusEventId: string;
  status: StatusEventState;
  stationId: string | null;
  startedAt: string;
  endedAt: string | null;
  reportType: string | null;
  reportReasonLabel: string | null;
  // Production data (populated for production status events)
  jobItemId: string | null;
  jobItemName: string | null;
  jobNumber: string | null;
  quantityGood: number;
};

export const fetchStatusEventsBySessionIds = async (
  sessionIds: string[],
): Promise<SessionStatusEvent[]> => {
  if (sessionIds.length === 0) {
    return [];
  }

  const supabase = createServiceSupabase();
  const runQuery = async (select: string) =>
    supabase
      .from("status_events")
      .select(select)
      .in("session_id", sessionIds)
      .order("started_at", { ascending: true });

  const { data, error } = await runQuery(
    "id, session_id, status_definition_id, started_at, ended_at, job_item_id, quantity_good, sessions!inner(station_id), status_definitions(report_type), job_items:job_item_id(name, jobs(job_number))",
  );

  let rows = (data as unknown as StatusEventRow[]) ?? null;

  if (error) {
    console.error("[admin-dashboard] Status events fetch failed (new schema)", error);
    const legacy = await runQuery(
      "id, session_id, status_code, started_at, ended_at, sessions!inner(station_id)",
    );
    if (legacy.error) {
      console.error(
        "[admin-dashboard] Status events fetch failed (legacy schema)",
        legacy.error,
      );
      return [];
    }
    rows = (legacy.data as unknown as StatusEventRow[]) ?? null;
  }

  if (!rows) {
    return [];
  }

  // Get status event IDs to fetch linked reports
  const statusEventIds = rows.map((row) => row.id);

  // Fetch reports linked to these status events
  const { data: reportsData } = await supabase
    .from("reports")
    .select(`
      status_event_id,
      type,
      station_reason_id,
      report_reasons:report_reason_id(label_he),
      stations:station_id(station_reasons)
    `)
    .in("status_event_id", statusEventIds);

  // Build a map of status_event_id -> report reason label
  const reportMap = new Map<string, string>();
  if (reportsData) {
    for (const report of reportsData as unknown as ReportForStatusEvent[]) {
      if (!report.status_event_id) continue;

      let label: string | null = null;

      if (report.type === "general" && report.report_reasons?.label_he) {
        label = report.report_reasons.label_he;
      } else if (report.type === "malfunction" && report.station_reason_id && report.stations?.station_reasons) {
        const reason = report.stations.station_reasons.find(
          (r) => r.id === report.station_reason_id
        );
        label = reason?.label_he ?? null;
      }

      if (label) {
        reportMap.set(report.status_event_id, label);
      }
    }
  }

  return rows.map((row) => ({
    sessionId: row.session_id,
    statusEventId: row.id,
    status: row.status_definition_id ?? row.status_code ?? "unknown",
    stationId: row.sessions?.station_id ?? null,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    reportType: row.status_definitions?.report_type ?? null,
    reportReasonLabel: reportMap.get(row.id) ?? null,
    // Production data
    jobItemId: row.job_item_id ?? null,
    jobItemName: row.job_items?.name ?? null,
    jobNumber: row.job_items?.jobs?.job_number ?? null,
    quantityGood: row.quantity_good ?? 0,
  }));
};


// ============================================
// LIVE JOB PROGRESS (for admin dashboard)
// ============================================

type ActiveJobSessionRow = {
  job_id: string;
  station_id: string | null;
  jobs: Job | null;
};

// Post Phase 5: job_items no longer has station_id, production_line_id, or kind columns
type JobItemRow = {
  id: string;
  job_id: string;
  name: string;
  pipeline_preset_id?: string | null;
  is_pipeline_locked?: boolean;
  planned_quantity: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  pipeline_presets?: { id: string; name: string } | null;
  job_item_steps?: Array<{
    id: string;
    job_item_id: string;
    station_id: string;
    position: number;
    is_terminal: boolean;
    stations: { id: string; name: string; code: string } | null;
  }>;
  wip_balances?: Array<{
    id: string;
    job_item_id: string;
    job_item_step_id: string;
    good_reported: number;
    scrap_reported: number;
  }>;
  job_item_progress?: { completed_good: number; completed_scrap?: number } | null;
};

/**
 * Fetch active jobs with progress data for the live dashboard.
 * Returns jobs that have at least one active session, sorted by session count (descending).
 */
export async function fetchActiveJobsWithProgress(): Promise<LiveJobProgress[]> {
  const supabase = createServiceSupabase();

  // Step 1: Get all active sessions grouped by job_id
  const { data: activeSessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("job_id, station_id, jobs(*)")
    .eq("status", "active")
    .is("ended_at", null);

  if (sessionsError) {
    console.error("[admin-dashboard] Failed to fetch active sessions for jobs", sessionsError);
    return [];
  }

  const sessions = (activeSessions ?? []) as unknown as ActiveJobSessionRow[];

  if (sessions.length === 0) {
    return [];
  }

  // Step 2: Group sessions by job_id and collect active station IDs
  const jobSessionMap = new Map<
    string,
    { job: Job; sessionCount: number; activeStationIds: Set<string> }
  >();

  sessions.forEach((session) => {
    if (!session.job_id || !session.jobs) return;

    const existing = jobSessionMap.get(session.job_id);
    if (existing) {
      existing.sessionCount += 1;
      if (session.station_id) {
        existing.activeStationIds.add(session.station_id);
      }
    } else {
      const stationIds = new Set<string>();
      if (session.station_id) {
        stationIds.add(session.station_id);
      }
      jobSessionMap.set(session.job_id, {
        job: session.jobs,
        sessionCount: 1,
        activeStationIds: stationIds,
      });
    }
  });

  // Step 3: For each job, fetch the first active job item with details
  const jobIds = Array.from(jobSessionMap.keys());

  // Post Phase 5: station_id, production_line_id, kind columns removed from job_items
  const { data: jobItemsData, error: itemsError } = await supabase
    .from("job_items")
    .select(`
      *,
      pipeline_presets:pipeline_preset_id(id, name),
      job_item_steps(id, job_item_id, station_id, position, is_terminal, stations(id, name, code)),
      wip_balances(*)
    `)
    .in("job_id", jobIds)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (itemsError) {
    console.error("[admin-dashboard] Failed to fetch job items", itemsError);
    return [];
  }

  const jobItems = (jobItemsData ?? []) as unknown as JobItemRow[];

  // Use job_item_progress for completed totals - it only tracks terminal station quantities
  const jobItemIds = jobItems.map((item) => item.id);
  const completedTotalsMap = new Map<string, { good: number; scrap: number }>();

  if (jobItemIds.length > 0) {
    const { data: progressData, error: progressError } = await supabase
      .from("job_item_progress")
      .select("job_item_id, completed_good, completed_scrap")
      .in("job_item_id", jobItemIds);

    if (progressError) {
      console.error("[admin-dashboard] Failed to fetch job item progress", progressError);
    } else {
      for (const row of progressData ?? []) {
        if (row.job_item_id) {
          completedTotalsMap.set(row.job_item_id, {
            good: row.completed_good ?? 0,
            scrap: row.completed_scrap ?? 0,
          });
        }
      }
    }
  }

  // Group ALL job items by job_id (not just first)
  const jobItemsMap = new Map<string, JobItemRow[]>();
  jobItems.forEach((item) => {
    const existing = jobItemsMap.get(item.job_id);
    if (existing) {
      existing.push(item);
    } else {
      jobItemsMap.set(item.job_id, [item]);
    }
  });

  // Step 4: Build LiveJobProgress array
  const results: LiveJobProgress[] = [];

  jobSessionMap.forEach(({ job, sessionCount, activeStationIds }, jobId) => {
    const jobItemsList = jobItemsMap.get(jobId) ?? [];
    const activeStationIdsArray = Array.from(activeStationIds);

    // Build assignments for all job items
    // Post Phase 5: All items are pipelines with job_item_steps
    const jobItemAssignments = jobItemsList.map((jobItem) => {
      const wipDistribution: WipStationData[] = [];

      // job_item_progress completed totals (terminal station only)
      const completedTotals = completedTotalsMap.get(jobItem.id) ?? { good: 0, scrap: 0 };
      const completedGood = completedTotals.good;
      const completedScrap = completedTotals.scrap;

      // All items now have job_item_steps (pipeline model)
      if (jobItem.job_item_steps && jobItem.job_item_steps.length > 0) {
        const sortedStations = [...jobItem.job_item_steps].sort(
          (a, b) => a.position - b.position
        );
        const wipGoodMap = new Map(
          (jobItem.wip_balances ?? []).map((wb) => [wb.job_item_step_id, wb.good_reported])
        );
        const wipScrapMap = new Map(
          (jobItem.wip_balances ?? []).map((wb) => [wb.job_item_step_id, wb.scrap_reported])
        );

        sortedStations.forEach((jis) => {
          const goodReported = wipGoodMap.get(jis.id) ?? 0;
          const scrapReported = wipScrapMap.get(jis.id) ?? 0;
          wipDistribution.push({
            jobItemStepId: jis.id,
            stationId: jis.station_id,
            stationName: jis.stations?.name ?? `שלב ${jis.position}`,
            position: jis.position,
            isTerminal: jis.is_terminal,
            goodReported,
            scrapReported,
            hasActiveSession: activeStationIds.has(jis.station_id),
          });
        });
      }

      // Build jobItem with partial station data (only name/code needed for display)
      const mappedJobItem: JobItemWithDetails = {
        id: jobItem.id,
        job_id: jobItem.job_id,
        name: jobItem.name,
        pipeline_preset_id: jobItem.pipeline_preset_id,
        is_pipeline_locked: jobItem.is_pipeline_locked,
        planned_quantity: jobItem.planned_quantity,
        is_active: jobItem.is_active,
        pipeline_preset: jobItem.pipeline_presets ?? undefined,
        job_item_stations: jobItem.job_item_steps?.map((jis) => ({
          id: jis.id,
          job_item_id: jis.job_item_id,
          station_id: jis.station_id,
          position: jis.position,
          is_terminal: jis.is_terminal,
          station: jis.stations as Station | undefined,
        })),
        job_item_steps: jobItem.job_item_steps?.map((jis) => ({
          id: jis.id,
          job_item_id: jis.job_item_id,
          station_id: jis.station_id,
          position: jis.position,
          is_terminal: jis.is_terminal,
          station: jis.stations as Station | undefined,
        })),
        wip_balances: jobItem.wip_balances ?? [],
        // completed totals from job_item_progress (terminal station only)
        progress: {
          job_item_id: jobItem.id,
          completed_good: completedGood,
          completed_scrap: completedScrap,
        },
      };

      return {
        jobItem: mappedJobItem,
        wipDistribution,
        completedGood,
        completedScrap,
        plannedQuantity: jobItem.planned_quantity,
      };
    });

    results.push({
      job,
      jobItems: jobItemAssignments,
      activeSessionCount: sessionCount,
      activeStationIds: activeStationIdsArray,
    });
  });

  // Sort by session count descending (most active first)
  results.sort((a, b) => b.activeSessionCount - a.activeSessionCount);

  return results;
}

