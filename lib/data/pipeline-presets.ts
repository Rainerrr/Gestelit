import { createServiceSupabase } from "@/lib/supabase/client";
import type {
  PipelinePreset,
  PipelinePresetStep,
  PipelinePresetWithSteps,
  Station,
} from "@/lib/types";

// ============================================
// PIPELINE PRESET QUERIES
// ============================================

type PipelinePresetStepRow = PipelinePresetStep & {
  stations: Station | null;
};

/**
 * Fetch all pipeline presets with optional filters.
 */
export async function fetchAllPipelinePresets(options?: {
  includeSteps?: boolean;
}): Promise<PipelinePresetWithSteps[]> {
  const supabase = createServiceSupabase();

  const selectQuery = options?.includeSteps
    ? `*, pipeline_preset_steps(*, stations(*))`
    : "*";

  const query = supabase
    .from("pipeline_presets")
    .select(selectQuery)
    .order("name", { ascending: true });

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch pipeline presets: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const preset = row as unknown as PipelinePreset & {
      pipeline_preset_steps?: PipelinePresetStepRow[];
    };

    const steps = (preset.pipeline_preset_steps ?? [])
      .sort((a, b) => a.position - b.position)
      .map((pps) => ({
        id: pps.id,
        pipeline_preset_id: pps.pipeline_preset_id,
        station_id: pps.station_id,
        position: pps.position,
        requires_first_product_approval: pps.requires_first_product_approval ?? false,
        created_at: pps.created_at,
        station: pps.stations ?? undefined,
      }));

    return {
      id: preset.id,
      name: preset.name,
      created_at: preset.created_at,
      updated_at: preset.updated_at,
      steps,
    };
  });
}

/**
 * Get a pipeline preset by ID with its steps.
 */
export async function getPipelinePresetById(
  id: string,
): Promise<PipelinePresetWithSteps | null> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("pipeline_presets")
    .select(`*, pipeline_preset_steps(*, stations(*))`)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch pipeline preset: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const preset = data as unknown as PipelinePreset & {
    pipeline_preset_steps?: PipelinePresetStepRow[];
  };

  const steps = (preset.pipeline_preset_steps ?? [])
    .sort((a, b) => a.position - b.position)
    .map((pps) => ({
      id: pps.id,
      pipeline_preset_id: pps.pipeline_preset_id,
      station_id: pps.station_id,
      position: pps.position,
      requires_first_product_approval: pps.requires_first_product_approval ?? false,
      created_at: pps.created_at,
      station: pps.stations ?? undefined,
    }));

  return {
    id: preset.id,
    name: preset.name,
    created_at: preset.created_at,
    updated_at: preset.updated_at,
    steps,
  };
}

// ============================================
// PIPELINE PRESET MUTATIONS
// ============================================

export type CreatePipelinePresetPayload = {
  name: string;
  station_ids?: string[];
  /** Map of station_id -> requires_first_product_approval */
  first_product_approval_flags?: Record<string, boolean>;
};

/**
 * Create a new pipeline preset with optional initial steps.
 */
export async function createPipelinePreset(
  payload: CreatePipelinePresetPayload,
): Promise<PipelinePresetWithSteps> {
  const supabase = createServiceSupabase();

  // Create the preset
  const { data: preset, error: presetError } = await supabase
    .from("pipeline_presets")
    .insert({
      name: payload.name.trim(),
    })
    .select("*")
    .single();

  if (presetError) {
    throw new Error(`Failed to create pipeline preset: ${presetError.message}`);
  }

  // Create steps if provided
  let steps: PipelinePresetStep[] = [];
  if (payload.station_ids && payload.station_ids.length > 0) {
    const stepsToInsert = payload.station_ids.map((stationId, index) => ({
      pipeline_preset_id: preset.id,
      station_id: stationId,
      position: index + 1,
      requires_first_product_approval: payload.first_product_approval_flags?.[stationId] ?? false,
    }));

    const { data: createdSteps, error: stepsError } = await supabase
      .from("pipeline_preset_steps")
      .insert(stepsToInsert)
      .select("*, stations(*)")
      .order("position", { ascending: true });

    if (stepsError) {
      // Rollback - delete the preset we just created
      await supabase.from("pipeline_presets").delete().eq("id", preset.id);
      throw new Error(`Failed to create pipeline steps: ${stepsError.message}`);
    }

    steps = (createdSteps ?? []).map((pps) => ({
      id: pps.id,
      pipeline_preset_id: pps.pipeline_preset_id,
      station_id: pps.station_id,
      position: pps.position,
      requires_first_product_approval: pps.requires_first_product_approval ?? false,
      created_at: pps.created_at,
      station: (pps as PipelinePresetStepRow).stations ?? undefined,
    }));
  }

  return {
    id: preset.id,
    name: preset.name,
    created_at: preset.created_at,
    updated_at: preset.updated_at,
    steps,
  };
}

export type UpdatePipelinePresetPayload = Partial<{
  name: string;
}>;

/**
 * Update a pipeline preset's metadata.
 */
export async function updatePipelinePreset(
  id: string,
  payload: UpdatePipelinePresetPayload,
): Promise<PipelinePreset> {
  const supabase = createServiceSupabase();

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (payload.name !== undefined) {
    updateData.name = payload.name.trim();
  }

  const { data, error } = await supabase
    .from("pipeline_presets")
    .update(updateData)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update pipeline preset: ${error.message}`);
  }

  return data as PipelinePreset;
}

/**
 * Check if a pipeline preset is in use by any active job items.
 */
export async function isPipelinePresetInUse(presetId: string): Promise<boolean> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("job_items")
    .select("id")
    .eq("pipeline_preset_id", presetId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check pipeline preset usage: ${error.message}`);
  }

  return data !== null;
}

/**
 * Delete a pipeline preset.
 * Fails if the preset is in use by active job items.
 */
export async function deletePipelinePreset(id: string): Promise<void> {
  const inUse = await isPipelinePresetInUse(id);
  if (inUse) {
    throw new Error("PIPELINE_PRESET_IN_USE");
  }

  const supabase = createServiceSupabase();

  const { error } = await supabase
    .from("pipeline_presets")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to delete pipeline preset: ${error.message}`);
  }
}

// ============================================
// PIPELINE PRESET STEPS
// ============================================

/**
 * Update the steps in a pipeline preset with new ordering.
 * This replaces all existing steps with the new list.
 *
 * @param presetId - The pipeline preset ID
 * @param stationIds - Ordered array of station IDs (position = index + 1)
 * @param firstProductApprovalFlags - Optional map of station_id -> requires_first_product_approval
 */
export async function updatePipelinePresetSteps(
  presetId: string,
  stationIds: string[],
  firstProductApprovalFlags?: Record<string, boolean>,
): Promise<PipelinePresetStep[]> {
  const supabase = createServiceSupabase();

  // Delete existing steps
  const { error: deleteError } = await supabase
    .from("pipeline_preset_steps")
    .delete()
    .eq("pipeline_preset_id", presetId);

  if (deleteError) {
    throw new Error(`Failed to clear pipeline steps: ${deleteError.message}`);
  }

  // Insert new steps
  if (stationIds.length === 0) {
    return [];
  }

  const stepsToInsert = stationIds.map((stationId, index) => ({
    pipeline_preset_id: presetId,
    station_id: stationId,
    position: index + 1,
    requires_first_product_approval: firstProductApprovalFlags?.[stationId] ?? false,
  }));

  const { data, error } = await supabase
    .from("pipeline_preset_steps")
    .insert(stepsToInsert)
    .select("*, stations(*)")
    .order("position", { ascending: true });

  if (error) {
    if (error.code === "23505") {
      throw new Error("DUPLICATE_STATION_IN_PRESET");
    }
    throw new Error(`Failed to update pipeline steps: ${error.message}`);
  }

  return (data ?? []).map((pps) => ({
    id: pps.id,
    pipeline_preset_id: pps.pipeline_preset_id,
    station_id: pps.station_id,
    position: pps.position,
    requires_first_product_approval: pps.requires_first_product_approval ?? false,
    created_at: pps.created_at,
    station: (pps as PipelinePresetStepRow).stations ?? undefined,
  }));
}

/**
 * Get all active stations for pipeline preset editing.
 * Unlike production lines, stations can be in multiple presets,
 * so we just return all active stations.
 */
export async function fetchAvailableStationsForPreset(): Promise<Station[]> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("stations")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch available stations: ${error.message}`);
  }

  return (data ?? []) as Station[];
}
