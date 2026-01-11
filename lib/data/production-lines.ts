import { createServiceSupabase } from "@/lib/supabase/client";
import type {
  ProductionLine,
  ProductionLineStation,
  ProductionLineWithStations,
  Station,
} from "@/lib/types";

// ============================================
// PRODUCTION LINE QUERIES
// ============================================

type ProductionLineStationRow = ProductionLineStation & {
  stations: Station | null;
};

/**
 * Fetch all production lines with optional filters.
 */
export async function fetchAllProductionLines(options?: {
  includeInactive?: boolean;
  includeStations?: boolean;
}): Promise<ProductionLineWithStations[]> {
  const supabase = createServiceSupabase();

  const selectQuery = options?.includeStations
    ? `*, production_line_stations(*, stations(*))`
    : "*";

  let query = supabase
    .from("production_lines")
    .select(selectQuery)
    .order("name", { ascending: true });

  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch production lines: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const line = row as unknown as ProductionLine & {
      production_line_stations?: ProductionLineStationRow[];
    };

    const stations = (line.production_line_stations ?? [])
      .sort((a, b) => a.position - b.position)
      .map((pls) => ({
        id: pls.id,
        production_line_id: pls.production_line_id,
        station_id: pls.station_id,
        position: pls.position,
        created_at: pls.created_at,
        station: pls.stations ?? undefined,
      }));

    return {
      id: line.id,
      name: line.name,
      code: line.code,
      is_active: line.is_active,
      created_at: line.created_at,
      updated_at: line.updated_at,
      stations,
    };
  });
}

/**
 * Get a production line by ID with its stations.
 */
export async function getProductionLineById(
  id: string,
): Promise<ProductionLineWithStations | null> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("production_lines")
    .select(`*, production_line_stations(*, stations(*))`)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch production line: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const line = data as unknown as ProductionLine & {
    production_line_stations?: ProductionLineStationRow[];
  };

  const stations = (line.production_line_stations ?? [])
    .sort((a, b) => a.position - b.position)
    .map((pls) => ({
      id: pls.id,
      production_line_id: pls.production_line_id,
      station_id: pls.station_id,
      position: pls.position,
      created_at: pls.created_at,
      station: pls.stations ?? undefined,
    }));

  return {
    id: line.id,
    name: line.name,
    code: line.code,
    is_active: line.is_active,
    created_at: line.created_at,
    updated_at: line.updated_at,
    stations,
  };
}

// ============================================
// PRODUCTION LINE MUTATIONS
// ============================================

export type CreateProductionLinePayload = {
  name: string;
  code?: string | null;
  is_active?: boolean;
};

/**
 * Create a new production line.
 */
export async function createProductionLine(
  payload: CreateProductionLinePayload,
): Promise<ProductionLine> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("production_lines")
    .insert({
      name: payload.name.trim(),
      code: payload.code?.trim() || null,
      is_active: payload.is_active ?? true,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505" && error.message.includes("code")) {
      throw new Error("PRODUCTION_LINE_CODE_EXISTS");
    }
    throw new Error(`Failed to create production line: ${error.message}`);
  }

  return data as ProductionLine;
}

export type UpdateProductionLinePayload = Partial<{
  name: string;
  code: string | null;
  is_active: boolean;
}>;

/**
 * Update a production line.
 */
export async function updateProductionLine(
  id: string,
  payload: UpdateProductionLinePayload,
): Promise<ProductionLine> {
  const supabase = createServiceSupabase();

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (payload.name !== undefined) {
    updateData.name = payload.name.trim();
  }
  if (payload.code !== undefined) {
    updateData.code = payload.code?.trim() || null;
  }
  if (payload.is_active !== undefined) {
    updateData.is_active = payload.is_active;
  }

  const { data, error } = await supabase
    .from("production_lines")
    .update(updateData)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505" && error.message.includes("code")) {
      throw new Error("PRODUCTION_LINE_CODE_EXISTS");
    }
    throw new Error(`Failed to update production line: ${error.message}`);
  }

  return data as ProductionLine;
}

/**
 * Check if a production line has active job items.
 * Lines with active job items are "locked" and cannot be deleted or have stations reordered.
 * Uses limit(1) for better performance instead of counting all rows.
 */
export async function isProductionLineLocked(lineId: string): Promise<boolean> {
  const supabase = createServiceSupabase();

  // Use exists pattern - just check if any row exists (more efficient than count)
  const { data, error } = await supabase
    .from("job_items")
    .select("id")
    .eq("production_line_id", lineId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check production line lock: ${error.message}`);
  }

  return data !== null;
}

/**
 * Delete a production line.
 * Fails if the line has active job items.
 */
export async function deleteProductionLine(id: string): Promise<void> {
  const isLocked = await isProductionLineLocked(id);
  if (isLocked) {
    throw new Error("PRODUCTION_LINE_HAS_ACTIVE_JOBS");
  }

  const supabase = createServiceSupabase();

  const { error } = await supabase
    .from("production_lines")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to delete production line: ${error.message}`);
  }
}

// ============================================
// PRODUCTION LINE STATIONS
// ============================================

/**
 * Update the stations in a production line with new ordering.
 * This replaces all existing stations with the new list.
 * Uses an atomic RPC function to prevent race conditions.
 *
 * @param lineId - The production line ID
 * @param stationIds - Ordered array of station IDs (position = index + 1)
 */
export async function updateProductionLineStations(
  lineId: string,
  stationIds: string[],
): Promise<ProductionLineStation[]> {
  const isLocked = await isProductionLineLocked(lineId);
  if (isLocked) {
    throw new Error("PRODUCTION_LINE_HAS_ACTIVE_JOBS");
  }

  const supabase = createServiceSupabase();

  // Use atomic RPC function to replace stations in a single transaction
  const { data, error } = await supabase.rpc("replace_production_line_stations", {
    p_line_id: lineId,
    p_station_ids: stationIds,
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error("STATION_ALREADY_IN_LINE");
    }
    throw new Error(`Failed to update production line stations: ${error.message}`);
  }

  return (data ?? []) as ProductionLineStation[];
}

/**
 * Get all stations that are not assigned to any production line.
 * These are "single-station" stations that can be used for single-station job items.
 */
export async function fetchUnassignedStations(): Promise<Station[]> {
  const supabase = createServiceSupabase();

  // Get all station IDs that are assigned to a line
  const { data: assignedData, error: assignedError } = await supabase
    .from("production_line_stations")
    .select("station_id");

  if (assignedError) {
    throw new Error(`Failed to fetch assigned stations: ${assignedError.message}`);
  }

  const assignedIds = (assignedData ?? []).map((row) => row.station_id);

  // Get all active stations not in the assigned list
  let query = supabase
    .from("stations")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (assignedIds.length > 0) {
    query = query.not("id", "in", `(${assignedIds.join(",")})`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch unassigned stations: ${error.message}`);
  }

  return (data ?? []) as Station[];
}

/**
 * Get all stations available for assignment to a production line.
 * Returns stations that are either:
 * - Not assigned to any line, OR
 * - Already assigned to the specified line (for editing)
 */
export async function fetchAvailableStationsForLine(
  lineId?: string,
): Promise<Station[]> {
  const supabase = createServiceSupabase();

  // Get all station IDs that are assigned to OTHER lines
  let assignedQuery = supabase
    .from("production_line_stations")
    .select("station_id");

  if (lineId) {
    assignedQuery = assignedQuery.neq("production_line_id", lineId);
  }

  const { data: assignedData, error: assignedError } = await assignedQuery;

  if (assignedError) {
    throw new Error(`Failed to fetch assigned stations: ${assignedError.message}`);
  }

  const assignedIds = (assignedData ?? []).map((row) => row.station_id);

  // Get all active stations not in the assigned list
  let query = supabase
    .from("stations")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (assignedIds.length > 0) {
    query = query.not("id", "in", `(${assignedIds.join(",")})`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch available stations: ${error.message}`);
  }

  return (data ?? []) as Station[];
}
