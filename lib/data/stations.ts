import { getActiveStationReasons, mergeStationReasonsWithDefault } from "@/lib/data/station-reasons";
import { createServiceSupabase } from "@/lib/supabase/client";
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

