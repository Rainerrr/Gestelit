import { createServiceSupabase } from "@/lib/supabase/client";
import type {
  MachineState,
  SessionStatus,
  StationType,
  StatusEventState,
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
  total_good: number;
  total_scrap: number;
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
  total_good,
  total_scrap,
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
  total_good,
  total_scrap,
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
  totalGood: row.total_good ?? 0,
  totalScrap: row.total_scrap ?? 0,
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

  // Fetch malfunction counts, stoppage times, and setup times for all sessions (in parallel)
  const sessionIds = rows.map((row) => row.id);
  const [malfunctionCounts, stoppageTimes, setupTimes] = await Promise.all([
    fetchMalfunctionCountsBySessionIds(sessionIds),
    fetchStoppageTimeBySessionIds(sessionIds),
    fetchSetupTimeBySessionIds(sessionIds),
  ]);

  return rows.map((row) =>
    mapActiveSession(
      row,
      null,
      malfunctionCounts.get(row.id) ?? 0,
      stoppageTimes.get(row.id) ?? 0,
      setupTimes.get(row.id) ?? 0,
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

  // Fetch malfunction count, stoppage time, and setup time for this session (in parallel)
  const [malfunctionCounts, stoppageTimes, setupTimes] = await Promise.all([
    fetchMalfunctionCountsBySessionIds([row.id]),
    fetchStoppageTimeBySessionIds([row.id]),
    fetchSetupTimeBySessionIds([row.id]),
  ]);

  return mapActiveSession(
    row,
    null,
    malfunctionCounts.get(row.id) ?? 0,
    stoppageTimes.get(row.id) ?? 0,
    setupTimes.get(row.id) ?? 0,
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
  job_id: string | null;
  total_good: number | null;
  total_scrap: number | null;
  ended_at: string | null;
  jobs: {
    job_number: string | null;
    planned_quantity: number | null;
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

  let query = supabase
    .from("sessions")
    .select(
      `
      job_id,
      total_good,
      total_scrap,
      ended_at,
      jobs:jobs(job_number, planned_quantity)
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
    const jobNumber = row.jobs?.job_number ?? "לא ידוע";
    const plannedQuantity =
      row.jobs?.planned_quantity != null
        ? row.jobs.planned_quantity
        : pickMockPlannedQuantity(jobNumber);
    const current =
      map.get(row.job_id) ??
      ({
        jobId: row.job_id,
        jobNumber,
        plannedQuantity,
        totalGood: 0,
        totalScrap: 0,
        lastEndedAt: row.ended_at,
      } satisfies JobThroughput);

    current.totalGood += row.total_good ?? 0;
    current.totalScrap += row.total_scrap ?? 0;

    if (new Date(row.ended_at).getTime() > new Date(current.lastEndedAt).getTime()) {
      current.lastEndedAt = row.ended_at;
    }

    map.set(row.job_id, current);
  });

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.lastEndedAt).getTime() - new Date(a.lastEndedAt).getTime(),
  );
};

