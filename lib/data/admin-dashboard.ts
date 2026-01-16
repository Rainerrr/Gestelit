import { createServiceSupabase } from "@/lib/supabase/client";
import type {
  Job,
  JobItemWithDetails,
  LiveJobProgress,
  MachineState,
  SessionStatus,
  Station,
  StationType,
  StatusEventState,
  WipStationData,
} from "@/lib/types";

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
};

export type CompletedSession = ActiveSession & {
  endedAt: string;
  durationSeconds: number;
  stoppageTimeSeconds: number;
  setupTimeSeconds: number;
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
 * Fetch derived totals (totalGood, totalScrap) for multiple sessions
 * Uses v_session_derived_totals view which sums from status_events
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

  // Fetch malfunction counts, stoppage times, setup times, and derived totals for all sessions (in parallel)
  const sessionIds = rows.map((row) => row.id);
  const [malfunctionCounts, stoppageTimes, setupTimes, derivedTotals] = await Promise.all([
    fetchMalfunctionCountsBySessionIds(sessionIds),
    fetchStoppageTimeBySessionIds(sessionIds),
    fetchSetupTimeBySessionIds(sessionIds),
    fetchDerivedTotalsBySessionIds(sessionIds),
  ]);

  return rows.map((row) =>
    mapActiveSession(
      row,
      null,
      malfunctionCounts.get(row.id) ?? 0,
      stoppageTimes.get(row.id) ?? 0,
      setupTimes.get(row.id) ?? 0,
      derivedTotals.get(row.id),
    ),
  );
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

  // Fetch malfunction count, stoppage time, setup time, and derived totals for this session (in parallel)
  const [malfunctionCounts, stoppageTimes, setupTimes, derivedTotals] = await Promise.all([
    fetchMalfunctionCountsBySessionIds([row.id]),
    fetchStoppageTimeBySessionIds([row.id]),
    fetchSetupTimeBySessionIds([row.id]),
    fetchDerivedTotalsBySessionIds([row.id]),
  ]);

  return mapActiveSession(
    row,
    null,
    malfunctionCounts.get(row.id) ?? 0,
    stoppageTimes.get(row.id) ?? 0,
    setupTimes.get(row.id) ?? 0,
    derivedTotals.get(row.id),
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

type FetchRecentSessionsArgs = {
  workerId?: string;
  stationId?: string;
  jobNumber?: string;
  limit?: number;
};

export const fetchRecentSessions = async (
  args: FetchRecentSessionsArgs = {},
): Promise<CompletedSession[]> => {
  const { workerId, stationId, jobNumber, limit = 8 } = args;
  const supabase = createServiceSupabase();
  let query = supabase
    .from("sessions")
    .select(ACTIVE_SESSIONS_SELECT)
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false })
    .limit(limit);

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

  // Fetch stoppage, setup times and malfunction counts for all sessions (in parallel)
  const sessionIds = rows.map((row) => row.id);
  const [stoppageMap, setupMap, malfunctionCountMap] = await Promise.all([
    fetchStoppageTimeBySessionIds(sessionIds),
    fetchSetupTimeBySessionIds(sessionIds),
    fetchMalfunctionCountsBySessionIds(sessionIds),
  ]);

  const sessionsWithNotes = await Promise.all(
    rows.map(async (row) => {
      const lastEventNote = await fetchLastEventNote(row.id);
      const malfunctionCount = malfunctionCountMap.get(row.id) ?? 0;
      const base = mapActiveSession(row, lastEventNote, malfunctionCount);
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

      return {
        ...base,
        endedAt,
        durationSeconds,
        stoppageTimeSeconds,
        setupTimeSeconds,
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
    "id, session_id, status_definition_id, started_at, ended_at, sessions!inner(station_id), status_definitions(report_type)",
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
  }));
};

export type JobThroughput = {
  jobId: string;
  jobNumber: string;
  plannedQuantity: number;
  totalGood: number;
  totalScrap: number;
  lastEndedAt: string;
};

type FetchMonthlyJobThroughputArgs = {
  year: number;
  month: number; // 1-12
  workerId?: string;
  stationId?: string;
  jobNumber?: string;
};

type MonthlySessionRow = {
  id: string;
  job_id: string | null;
  ended_at: string | null;
  jobs: {
    job_number: string | null;
  } | null;
  // Derived from status_events
  derived_totals: {
    total_good: number;
    total_scrap: number;
  } | null;
};

export const fetchMonthlyJobThroughput = async (
  args: FetchMonthlyJobThroughputArgs,
): Promise<JobThroughput[]> => {
  const { year, month, workerId, stationId, jobNumber } = args;
  if (!year || !month) return [];

  const supabase = createServiceSupabase();
  const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0));

  // Step 1: Query sessions
  let query = supabase
    .from("sessions")
    .select(
      `
      id,
      job_id,
      ended_at,
      jobs:jobs(job_number)
    `,
    )
    .eq("status", "completed")
    .not("job_id", "is", null)
    .gte("ended_at", monthStart.toISOString())
    .lt("ended_at", monthEnd.toISOString());

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
    console.error("[admin-dashboard] Failed to fetch monthly jobs", error);
    return [];
  }

  const rows = (data as unknown as MonthlySessionRow[]) ?? [];
  if (rows.length === 0) return [];

  // Step 2: Get derived totals from status_events for these sessions
  const sessionIds = rows.map((r) => r.id).filter(Boolean);
  const { data: totalsData } = await supabase
    .from("v_session_derived_totals")
    .select("session_id, total_good, total_scrap")
    .in("session_id", sessionIds);

  const totalsMap = new Map<string, { total_good: number; total_scrap: number }>();
  (totalsData ?? []).forEach((t: { session_id: string; total_good: number; total_scrap: number }) => {
    totalsMap.set(t.session_id, { total_good: t.total_good, total_scrap: t.total_scrap });
  });

  // Step 3: Get planned quantities from job_items (summed per job)
  const jobIds = [...new Set(rows.map((r) => r.job_id).filter(Boolean))] as string[];
  const { data: jobItemsData } = await supabase
    .from("job_items")
    .select("job_id, planned_quantity")
    .in("job_id", jobIds)
    .eq("is_active", true);

  const plannedQtyMap = new Map<string, number>();
  (jobItemsData ?? []).forEach((ji: { job_id: string; planned_quantity: number }) => {
    const current = plannedQtyMap.get(ji.job_id) ?? 0;
    plannedQtyMap.set(ji.job_id, current + (ji.planned_quantity ?? 0));
  });

  const map = new Map<string, JobThroughput>();

  const pickMockPlannedQuantity = (jobNum: string | null | undefined) => {
    const options = [40, 50, 60, 70, 80, 90];
    if (!jobNum) return 50;
    let hash = 0;
    for (let i = 0; i < jobNum.length; i += 1) {
      hash = (hash * 31 + jobNum.charCodeAt(i)) | 0;
    }
    const index = Math.abs(hash) % options.length;
    return options[index];
  };

  rows.forEach((row) => {
    if (!row.job_id || !row.ended_at) {
      return;
    }
    const jobNum = row.jobs?.job_number ?? "לא ידוע";
    const plannedQuantity =
      plannedQtyMap.get(row.job_id) ?? pickMockPlannedQuantity(jobNum);
    const totals = totalsMap.get(row.id) ?? { total_good: 0, total_scrap: 0 };

    const current =
      map.get(row.job_id) ??
      ({
        jobId: row.job_id,
        jobNumber: jobNum,
        plannedQuantity,
        totalGood: 0,
        totalScrap: 0,
        lastEndedAt: row.ended_at,
      } satisfies JobThroughput);

    current.totalGood += totals.total_good ?? 0;
    current.totalScrap += totals.total_scrap ?? 0;

    if (new Date(row.ended_at).getTime() > new Date(current.lastEndedAt).getTime()) {
      current.lastEndedAt = row.ended_at;
    }

    map.set(row.job_id, current);
  });

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.lastEndedAt).getTime() - new Date(a.lastEndedAt).getTime(),
  );
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
    good_available: number;
  }>;
  job_item_progress?: { completed_good: number } | null;
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
      wip_balances(*),
      job_item_progress(*)
    `)
    .in("job_id", jobIds)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (itemsError) {
    console.error("[admin-dashboard] Failed to fetch job items", itemsError);
    return [];
  }

  const jobItems = (jobItemsData ?? []) as unknown as JobItemRow[];

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
      let completedGood = 0;

      // Get progress (completed good from terminal station)
      completedGood = jobItem.job_item_progress?.completed_good ?? 0;

      // All items now have job_item_steps (pipeline model)
      if (jobItem.job_item_steps && jobItem.job_item_steps.length > 0) {
        const sortedStations = [...jobItem.job_item_steps].sort(
          (a, b) => a.position - b.position
        );
        const wipMap = new Map(
          (jobItem.wip_balances ?? []).map((wb) => [wb.job_item_step_id, wb.good_available])
        );

        sortedStations.forEach((jis) => {
          wipDistribution.push({
            jobItemStationId: jis.id,
            jobItemStepId: jis.id,
            stationId: jis.station_id,
            stationName: jis.stations?.name ?? `שלב ${jis.position}`,
            position: jis.position,
            isTerminal: jis.is_terminal,
            goodAvailable: wipMap.get(jis.id) ?? 0,
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
        wip_balances: jobItem.wip_balances,
        progress: jobItem.job_item_progress
          ? {
              job_item_id: jobItem.id,
              completed_good: jobItem.job_item_progress.completed_good,
            }
          : undefined,
      };

      return {
        jobItem: mappedJobItem,
        wipDistribution,
        completedGood,
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

