import { createServiceSupabase } from "@/lib/supabase/client";
import type { Malfunction } from "@/lib/types";

type MalfunctionPayload = {
  station_id: string;
  station_reason_id?: string | null;
  description?: string | null;
  image_url?: string | null;
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
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create malfunction: ${error.message}`);
  }

  return data as Malfunction;
}

