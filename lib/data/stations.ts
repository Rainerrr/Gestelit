import { getActiveStationReasons, mergeStationReasonsWithDefault } from "@/lib/data/station-reasons";
import { getJobAllowedStationIds } from "@/lib/data/job-items";
import { createServiceSupabase } from "@/lib/supabase/client";
import { SESSION_GRACE_MS } from "@/lib/constants";
import type { Station, StationReason } from "@/lib/types";

type WorkerStationRow = {
  station_id: string;
  stations: Station | null;
};

export async function fetchStationsForWorker(
  workerId: string,
): Promise<Station[]> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("worker_stations")
    .select("station_id, stations(*)")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch worker stations: ${error.message}`);
  }

  const rows = (data as unknown as WorkerStationRow[]) ?? [];
  return rows
    .map((row) => row.stations)
    .filter(Boolean)
    .map((station) => ({
      ...(station as Station),
      station_reasons: mergeStationReasonsWithDefault(
        (station as Station).station_reasons,
      ),
    }))
    .filter((station) => station.is_active);
}

export async function getStationById(
  stationId: string,
): Promise<Station | null> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("stations")
    .select("*")
    .eq("id", stationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch station: ${error.message}`);
  }

  const station = data as Station | null;
  if (station && !station.is_active) {
    return null;
  }

  if (!station) {
    return null;
  }

  return {
    ...station,
    station_reasons: mergeStationReasonsWithDefault(station.station_reasons),
  };
}

export async function getStationActiveReasons(
  stationId: string,
): Promise<StationReason[]> {
  const station = await getStationById(stationId);
  if (!station) {
    throw new Error("STATION_NOT_FOUND");
  }
  return getActiveStationReasons(station.station_reasons);
}

// SESSION_GRACE_MS is imported from @/lib/constants

export type StationOccupancy = {
  isOccupied: boolean;
  isGracePeriod: boolean;
  occupiedBy?: {
    workerId: string;
    workerName: string;
    sessionId: string;
    lastSeenAt: string;
    graceExpiresAt: string;
  };
};

export type StationWithOccupancy = Station & {
  occupancy: StationOccupancy;
};

type StationWithSessionRow = {
  station_id: string;
  stations: Station | null;
};

type ActiveSessionInfo = {
  id: string;
  worker_id: string;
  last_seen_at: string | null;
  started_at: string;
  workers: { id: string; full_name: string } | null;
};

/**
 * Fetch stations for a worker with occupancy information.
 * Shows which stations have active sessions (including grace period).
 *
 * A station is considered occupied if:
 * - It has an active session (status='active', ended_at IS NULL, forced_closed_at IS NULL)
 * - AND the session is within the grace period (last_seen_at + 5min > now)
 */
export async function fetchStationsWithOccupancy(
  workerId: string,
): Promise<StationWithOccupancy[]> {
  const supabase = createServiceSupabase();

  // First, get stations for this worker
  const { data: workerStations, error: stationsError } = await supabase
    .from("worker_stations")
    .select("station_id, stations(*)")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: true });

  if (stationsError) {
    throw new Error(`Failed to fetch worker stations: ${stationsError.message}`);
  }

  const rows = (workerStations as unknown as StationWithSessionRow[]) ?? [];
  const stations = rows
    .map((row) => row.stations)
    .filter(Boolean)
    .map((station) => ({
      ...(station as Station),
      station_reasons: mergeStationReasonsWithDefault(
        (station as Station).station_reasons,
      ),
    }))
    .filter((station) => station.is_active);

  if (stations.length === 0) {
    return [];
  }

  // Get station IDs for the query
  const stationIds = stations.map((s) => s.id);

  // Calculate grace period cutoff (5 minutes ago)
  const graceCutoff = new Date(Date.now() - SESSION_GRACE_MS).toISOString();

  // Fetch active sessions for these stations
  // A session is "active" if:
  // - status = 'active'
  // - ended_at IS NULL
  // - forced_closed_at IS NULL
  // - (last_seen_at > graceCutoff OR started_at > graceCutoff)
  const { data: activeSessions, error: sessionsError } = await supabase
    .from("sessions")
    .select(`
      id,
      station_id,
      worker_id,
      last_seen_at,
      started_at,
      workers:workers(id, full_name)
    `)
    .in("station_id", stationIds)
    .eq("status", "active")
    .is("ended_at", null)
    .is("forced_closed_at", null)
    .or(`last_seen_at.gt.${graceCutoff},started_at.gt.${graceCutoff}`);

  if (sessionsError) {
    throw new Error(`Failed to fetch active sessions: ${sessionsError.message}`);
  }

  // Build a map of station_id -> active session
  const sessionByStation = new Map<string, ActiveSessionInfo & { station_id: string }>();
  for (const session of activeSessions ?? []) {
    const typedSession = session as unknown as ActiveSessionInfo & { station_id: string };
    // If multiple sessions exist (shouldn't happen), take the most recent
    const existing = sessionByStation.get(typedSession.station_id);
    if (!existing || typedSession.started_at > existing.started_at) {
      sessionByStation.set(typedSession.station_id, typedSession);
    }
  }

  // Enrich stations with occupancy info
  const now = Date.now();
  return stations.map((station): StationWithOccupancy => {
    const activeSession = sessionByStation.get(station.id);

    if (!activeSession) {
      return {
        ...station,
        occupancy: {
          isOccupied: false,
          isGracePeriod: false,
        },
      };
    }

    // Calculate if in grace period (not actively sending heartbeats)
    const lastSeenSource = activeSession.last_seen_at ?? activeSession.started_at;
    const lastSeenMs = new Date(lastSeenSource).getTime();
    const graceExpiresAtMs = lastSeenMs + SESSION_GRACE_MS;
    const isGracePeriod = now > lastSeenMs + 30_000; // Consider grace if no heartbeat for 30s

    // Check if it's the current worker's own session
    const isOwnSession = activeSession.worker_id === workerId;

    return {
      ...station,
      occupancy: {
        isOccupied: !isOwnSession, // Not occupied if it's your own session
        isGracePeriod: isGracePeriod && !isOwnSession,
        occupiedBy: isOwnSession
          ? undefined
          : {
              workerId: activeSession.worker_id,
              workerName: activeSession.workers?.full_name ?? "Unknown",
              sessionId: activeSession.id,
              lastSeenAt: lastSeenSource,
              graceExpiresAt: new Date(graceExpiresAtMs).toISOString(),
            },
      },
    };
  });
}

/**
 * Check if a station is currently occupied by another worker.
 * Used for server-side validation before session creation.
 */
export async function isStationOccupied(
  stationId: string,
  excludeWorkerId?: string,
): Promise<{ occupied: boolean; occupiedBy?: { workerId: string; workerName: string } }> {
  const supabase = createServiceSupabase();
  const graceCutoff = new Date(Date.now() - SESSION_GRACE_MS).toISOString();

  let query = supabase
    .from("sessions")
    .select(`
      id,
      worker_id,
      workers:workers(id, full_name)
    `)
    .eq("station_id", stationId)
    .eq("status", "active")
    .is("ended_at", null)
    .is("forced_closed_at", null)
    .or(`last_seen_at.gt.${graceCutoff},started_at.gt.${graceCutoff}`)
    .limit(1);

  // Exclude the current worker's sessions
  if (excludeWorkerId) {
    query = query.neq("worker_id", excludeWorkerId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`Failed to check station occupancy: ${error.message}`);
  }

  if (!data) {
    return { occupied: false };
  }

  const session = data as unknown as {
    worker_id: string;
    workers: { full_name: string } | null;
  };

  return {
    occupied: true,
    occupiedBy: {
      workerId: session.worker_id,
      workerName: session.workers?.full_name ?? "Unknown",
    },
  };
}

// ============================================
// JOB + WORKER INTERSECTION
// ============================================

/**
 * Fetch stations that are BOTH:
 * 1. Assigned to the worker (worker_stations)
 * 2. Part of the job's job_items (via job_item_stations)
 *
 * This is the intersection required for the worker flow:
 * Worker can only select stations that they're assigned to AND that are relevant to the job.
 */
export async function fetchAllowedStationsForJobAndWorker(
  jobId: string,
  workerId: string,
): Promise<StationWithOccupancy[]> {
  // Get all station IDs allowed for this job (from job_items)
  const jobStationIds = await getJobAllowedStationIds(jobId);

  if (jobStationIds.length === 0) {
    // Job has no job_items configured - return empty array
    // (Worker flow should block before this point)
    return [];
  }

  // Get all stations assigned to this worker with occupancy info
  const workerStations = await fetchStationsWithOccupancy(workerId);

  // Filter to only stations that are in both sets (intersection)
  const jobStationIdSet = new Set(jobStationIds);
  const allowedStations = workerStations.filter((station) =>
    jobStationIdSet.has(station.id)
  );

  return allowedStations;
}

/**
 * Check if a station is allowed for a job and worker combination.
 * Used for server-side validation during session creation.
 */
export async function isStationAllowedForJobAndWorker(
  stationId: string,
  jobId: string,
  workerId: string,
): Promise<boolean> {
  const supabase = createServiceSupabase();

  // Check if worker is assigned to this station
  const { count: workerCount, error: workerError } = await supabase
    .from("worker_stations")
    .select("*", { count: "exact", head: true })
    .eq("worker_id", workerId)
    .eq("station_id", stationId);

  if (workerError) {
    throw new Error(`Failed to check worker assignment: ${workerError.message}`);
  }

  if ((workerCount ?? 0) === 0) {
    return false; // Worker not assigned to this station
  }

  // Check if this station is part of the job's job_items
  const jobStationIds = await getJobAllowedStationIds(jobId);
  return jobStationIds.includes(stationId);
}

