import { createServiceSupabase } from "@/lib/supabase/client";
import type { Station } from "@/lib/types";

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
    .map((station) => station as Station)
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

  return station;
}

