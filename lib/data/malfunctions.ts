import { createServiceSupabase } from "@/lib/supabase/client";
import type { Malfunction, MalfunctionStatus, MalfunctionWithDetails, Station, StationReason } from "@/lib/types";

type MalfunctionPayload = {
  station_id: string;
  station_reason_id?: string | null;
  description?: string | null;
  image_url?: string | null;
  reported_by_worker_id?: string | null;
  session_id?: string | null;
};

export async function createMalfunction(
  payload: MalfunctionPayload,
): Promise<Malfunction> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("malfunctions")
    .insert({
      station_id: payload.station_id,
      station_reason_id: payload.station_reason_id ?? null,
      description: payload.description ?? null,
      image_url: payload.image_url ?? null,
      reported_by_worker_id: payload.reported_by_worker_id ?? null,
      session_id: payload.session_id ?? null,
      status: "open",
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create malfunction: ${error.message}`);
  }

  return data as Malfunction;
}

export type StationWithMalfunctions = {
  station: Station;
  malfunctions: MalfunctionWithDetails[];
  openCount: number;
  knownCount: number;
};

export type StationWithArchivedMalfunctions = {
  station: Station;
  malfunctions: MalfunctionWithDetails[];
  solvedCount: number;
};

export async function getOpenMalfunctionsGroupedByStation(): Promise<StationWithMalfunctions[]> {
  const supabase = createServiceSupabase();

  // Get all non-solved malfunctions
  const { data: malfunctions, error: malfunctionsError } = await supabase
    .from("malfunctions")
    .select("*")
    .neq("status", "solved")
    .order("created_at", { ascending: false });

  if (malfunctionsError) {
    throw new Error(`Failed to fetch malfunctions: ${malfunctionsError.message}`);
  }

  if (!malfunctions || malfunctions.length === 0) {
    return [];
  }

  // Get unique station IDs and worker IDs
  const stationIds = [...new Set(malfunctions.map((m) => m.station_id))];
  const workerIds = [...new Set(malfunctions.map((m) => m.reported_by_worker_id).filter(Boolean))] as string[];

  // Fetch stations
  const { data: stations, error: stationsError } = await supabase
    .from("stations")
    .select("id, name, code, station_type, is_active, station_reasons")
    .in("id", stationIds);

  if (stationsError) {
    throw new Error(`Failed to fetch stations: ${stationsError.message}`);
  }

  // Fetch workers (reporters)
  let workersMap = new Map<string, { id: string; full_name: string; worker_code: string }>();
  if (workerIds.length > 0) {
    const { data: workers, error: workersError } = await supabase
      .from("workers")
      .select("id, full_name, worker_code")
      .in("id", workerIds);

    if (!workersError && workers) {
      for (const w of workers) {
        workersMap.set(w.id, w);
      }
    }
  }

  // Create station lookup
  const stationsMap = new Map<string, Station>();
  for (const s of stations || []) {
    stationsMap.set(s.id, s as Station);
  }

  // Group by station
  const stationMalfunctionsMap = new Map<string, StationWithMalfunctions>();

  for (const m of malfunctions) {
    const stationId = m.station_id;
    const station = stationsMap.get(stationId);

    if (!station) continue;

    if (!stationMalfunctionsMap.has(stationId)) {
      stationMalfunctionsMap.set(stationId, {
        station,
        malfunctions: [],
        openCount: 0,
        knownCount: 0,
      });
    }

    const entry = stationMalfunctionsMap.get(stationId)!;
    const reporter = m.reported_by_worker_id ? workersMap.get(m.reported_by_worker_id) : null;

    entry.malfunctions.push({
      id: m.id,
      station_id: m.station_id,
      station_reason_id: m.station_reason_id,
      description: m.description,
      image_url: m.image_url,
      status: m.status as MalfunctionStatus,
      reported_by_worker_id: m.reported_by_worker_id,
      status_changed_at: m.status_changed_at,
      status_changed_by: m.status_changed_by,
      admin_notes: m.admin_notes,
      created_at: m.created_at,
      updated_at: m.updated_at,
      station: station,
      reporter: reporter ?? null,
    });

    if (m.status === "open") {
      entry.openCount++;
    } else if (m.status === "known") {
      entry.knownCount++;
    }
  }

  // Sort stations by total malfunction count (descending)
  return Array.from(stationMalfunctionsMap.values()).sort(
    (a, b) => (b.openCount + b.knownCount) - (a.openCount + a.knownCount)
  );
}

export type UpdateMalfunctionStatusPayload = {
  malfunctionId: string;
  status: MalfunctionStatus;
  adminNotes?: string | null;
  changedBy?: string;
};

export async function updateMalfunctionStatus(
  payload: UpdateMalfunctionStatusPayload,
): Promise<Malfunction> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("malfunctions")
    .update({
      status: payload.status,
      admin_notes: payload.adminNotes ?? null,
      status_changed_at: new Date().toISOString(),
      status_changed_by: payload.changedBy ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payload.malfunctionId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update malfunction status: ${error.message}`);
  }

  return data as Malfunction;
}

export function getReasonLabel(
  stationReasons: StationReason[] | null | undefined,
  reasonId: string | null | undefined,
  lang: "he" | "ru" = "he"
): string {
  if (!reasonId || !stationReasons) return "";

  const reason = stationReasons.find((r) => r.id === reasonId);
  if (!reason) return reasonId;

  return lang === "ru" ? reason.label_ru : reason.label_he;
}

/**
 * Get count of open malfunctions (for notification badge)
 */
export async function getOpenMalfunctionsCount(): Promise<number> {
  const supabase = createServiceSupabase();

  const { count, error } = await supabase
    .from("malfunctions")
    .select("*", { count: "exact", head: true })
    .eq("status", "open");

  if (error) {
    throw new Error(`Failed to count malfunctions: ${error.message}`);
  }

  return count ?? 0;
}

/**
 * Get all solved (archived) malfunctions grouped by station
 */
export async function getArchivedMalfunctionsGroupedByStation(): Promise<StationWithArchivedMalfunctions[]> {
  const supabase = createServiceSupabase();

  // Get all solved malfunctions, ordered by when they were solved (most recent first)
  const { data: malfunctions, error: malfunctionsError } = await supabase
    .from("malfunctions")
    .select("*")
    .eq("status", "solved")
    .order("status_changed_at", { ascending: false });

  if (malfunctionsError) {
    throw new Error(`Failed to fetch archived malfunctions: ${malfunctionsError.message}`);
  }

  if (!malfunctions || malfunctions.length === 0) {
    return [];
  }

  // Get unique station IDs and worker IDs
  const stationIds = [...new Set(malfunctions.map((m) => m.station_id))];
  const workerIds = [...new Set(malfunctions.map((m) => m.reported_by_worker_id).filter(Boolean))] as string[];

  // Fetch stations
  const { data: stations, error: stationsError } = await supabase
    .from("stations")
    .select("id, name, code, station_type, is_active, station_reasons")
    .in("id", stationIds);

  if (stationsError) {
    throw new Error(`Failed to fetch stations: ${stationsError.message}`);
  }

  // Fetch workers (reporters)
  let workersMap = new Map<string, { id: string; full_name: string; worker_code: string }>();
  if (workerIds.length > 0) {
    const { data: workers, error: workersError } = await supabase
      .from("workers")
      .select("id, full_name, worker_code")
      .in("id", workerIds);

    if (!workersError && workers) {
      for (const w of workers) {
        workersMap.set(w.id, w);
      }
    }
  }

  // Create station lookup
  const stationsMap = new Map<string, Station>();
  for (const s of stations || []) {
    stationsMap.set(s.id, s as Station);
  }

  // Group by station
  const stationMalfunctionsMap = new Map<string, StationWithArchivedMalfunctions>();

  for (const m of malfunctions) {
    const stationId = m.station_id;
    const station = stationsMap.get(stationId);

    if (!station) continue;

    if (!stationMalfunctionsMap.has(stationId)) {
      stationMalfunctionsMap.set(stationId, {
        station,
        malfunctions: [],
        solvedCount: 0,
      });
    }

    const entry = stationMalfunctionsMap.get(stationId)!;
    const reporter = m.reported_by_worker_id ? workersMap.get(m.reported_by_worker_id) : null;

    entry.malfunctions.push({
      id: m.id,
      station_id: m.station_id,
      station_reason_id: m.station_reason_id,
      description: m.description,
      image_url: m.image_url,
      status: m.status as MalfunctionStatus,
      reported_by_worker_id: m.reported_by_worker_id,
      session_id: m.session_id,
      status_changed_at: m.status_changed_at,
      status_changed_by: m.status_changed_by,
      admin_notes: m.admin_notes,
      created_at: m.created_at,
      updated_at: m.updated_at,
      station: station,
      reporter: reporter ?? null,
    });

    entry.solvedCount++;
  }

  // Sort stations by solved count (descending)
  return Array.from(stationMalfunctionsMap.values()).sort(
    (a, b) => b.solvedCount - a.solvedCount
  );
}
