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
  stationId: string;
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
  worker_id: string;
  station_id: string;
  job_id: string;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  total_good: number;
  total_scrap: number;
  forced_closed_at: string | null;
};

type RawActiveSession = SessionRow & {
  current_status: StatusEventState | null;
  last_status_change_at: string | null;
  jobs: { job_number: string | null } | null;
  stations: { name: string | null; station_type: StationType | null } | null;
  workers: { full_name: string | null } | null;
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
  current_status,
  last_status_change_at,
  forced_closed_at,
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
  stationId: row.station_id,
  stationName: row.stations?.name ?? "לא משויך",
  stationType: row.stations?.station_type ?? null,
  workerId: row.worker_id,
  workerName: row.workers?.full_name ?? "לא משויך",
  status: row.status,
  currentStatus: row.current_status ?? null,
  lastStatusChangeAt: row.last_status_change_at ?? row.started_at,
  startedAt: row.started_at,
  totalGood: row.total_good ?? 0,
  totalScrap: row.total_scrap ?? 0,
  forcedClosedAt: row.forced_closed_at,
  lastEventNote,
});

export const fetchActiveSessions = async (): Promise<ActiveSession[]> => {
  const supabase = getBrowserSupabaseClient();

  const { data, error } = await supabase
    .from("sessions")
    .select(ACTIVE_SESSIONS_SELECT)
    .eq("status", "active")
    .is("ended_at", null)
    .order("started_at", { ascending: false });

  if (error) {
    console.error("[admin-dashboard] Failed to fetch active sessions", error);
    return [];
  }

  const rows = (data as RawActiveSession[]) ?? [];
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

export const fetchRecentSessions = async (
  limit = 8,
): Promise<CompletedSession[]> => {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase
    .from("sessions")
    .select(ACTIVE_SESSIONS_SELECT)
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false })
    .limit(limit);

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



