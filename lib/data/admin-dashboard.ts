import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import type {
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
};

export type CompletedSession = ActiveSession & {
  endedAt: string;
  durationSeconds: number;
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
});

export const fetchActiveSessions = async (): Promise<ActiveSession[]> => {
  const supabase = getBrowserSupabaseClient();

  const runQuery = async (select: string) =>
    supabase
      .from("sessions")
      .select(select)
      .eq("status", "active")
      .is("ended_at", null)
      .order("started_at", { ascending: false });

  const { data, error } = await runQuery(ACTIVE_SESSIONS_SELECT);

  let rows = data as RawActiveSession[] | null;

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
    rows = legacyResult.data as RawActiveSession[];
  }

  if (!rows) {
    return [];
  }

  console.log(
    `[admin-dashboard] Fetched ${rows.length} active sessions`,
    rows.map((r) => ({ id: r.id, status: r.status, ended_at: r.ended_at })),
  );

  return rows.map((row) => mapActiveSession(row));
};

export const subscribeToActiveSessions = (
  onRefresh: () => void | Promise<void>,
) => {
  const supabase = getBrowserSupabaseClient();
  const channel = supabase
    .channel("admin-active-sessions")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "sessions" },
      (payload) => {
        console.log("[admin-realtime] INSERT event", payload.new);
        void onRefresh();
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "sessions" },
      (payload) => {
        console.log("[admin-realtime] UPDATE event", {
          old: payload.old,
          new: payload.new,
        });
        void onRefresh();
      },
    )
    .subscribe((status, err) => {
      console.log("[admin-realtime] Subscription status:", status, err);
    });

  return () => {
    console.log("[admin-realtime] Unsubscribing");
    void supabase.removeChannel(channel);
  };
};

const fetchLastEventNote = async (sessionId: string): Promise<string | null> => {
  const supabase = getBrowserSupabaseClient();
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
  const supabase = getBrowserSupabaseClient();
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

  const rows = (data as RawActiveSession[]) ?? [];

  const sessionsWithNotes = await Promise.all(
    rows.map(async (row) => {
      const lastEventNote = await fetchLastEventNote(row.id);
      const base = mapActiveSession(row, lastEventNote);
      const endedAt = row.ended_at ?? row.started_at;
      const durationSeconds = Math.max(
        0,
        Math.floor(
          (new Date(endedAt).getTime() - new Date(row.started_at).getTime()) /
            1000,
        ),
      );

      return {
        ...base,
        endedAt,
        durationSeconds,
      };
    }),
  );

  return sessionsWithNotes;
};

type StatusEventRow = {
  session_id: string;
  status_definition_id?: StatusEventState;
  status_code?: StatusEventState;
  started_at: string;
  ended_at: string | null;
  sessions?: { station_id: string | null } | null;
};

export type SessionStatusEvent = {
  sessionId: string;
  status: StatusEventState;
  stationId: string | null;
  startedAt: string;
  endedAt: string | null;
};

export const fetchStatusEventsBySessionIds = async (
  sessionIds: string[],
): Promise<SessionStatusEvent[]> => {
  if (sessionIds.length === 0) {
    return [];
  }

  const supabase = getBrowserSupabaseClient();
  const runQuery = async (select: string) =>
    supabase
      .from("status_events")
      .select(select)
      .in("session_id", sessionIds)
      .order("started_at", { ascending: true });

  const { data, error } = await runQuery(
    "session_id, status_definition_id, started_at, ended_at, sessions!inner(station_id)",
  );

  let rows = data as StatusEventRow[] | null;

  if (error) {
    console.error("[admin-dashboard] Status events fetch failed (new schema)", error);
    const legacy = await runQuery(
      "session_id, status_code, started_at, ended_at, sessions!inner(station_id)",
    );
    if (legacy.error) {
      console.error(
        "[admin-dashboard] Status events fetch failed (legacy schema)",
        legacy.error,
      );
      return [];
    }
    rows = legacy.data as StatusEventRow[];
  }

  if (!rows) {
    return [];
  }

  return rows.map((row) => ({
    sessionId: row.session_id,
    status: row.status_definition_id ?? row.status_code ?? null,
    stationId: row.sessions?.station_id ?? null,
    startedAt: row.started_at,
    endedAt: row.ended_at,
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

  const supabase = getBrowserSupabaseClient();
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

  const rows = (data as MonthlySessionRow[]) ?? [];
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



