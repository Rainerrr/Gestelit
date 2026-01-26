import { createServiceSupabase } from "@/lib/supabase/client";
import { SESSION_GRACE_MS } from "@/lib/constants";
import type {
  JobItem,
  JobItemProgress,
  JobItemStation,
  JobItemWithDetails,
  PipelineStationOption,
  Station,
  StationOccupancy,
  StationSelectionJobItem,
  WipBalance,
} from "@/lib/types";

// ============================================
// JOB ITEM QUERIES
// ============================================

type JobItemStationRow = JobItemStation & {
  stations: Station | null;
  requires_first_product_approval?: boolean;
};

type PipelinePresetPartial = {
  id: string;
  name: string;
};

type JobItemRow = JobItem & {
  pipeline_presets?: PipelinePresetPartial | null;
  job_item_steps?: JobItemStationRow[];
  job_item_progress?: JobItemProgress | null;
  wip_balances?: WipBalance[];
};

/**
 * Fetch all job items for a job with optional details.
 */
export async function fetchJobItemsForJob(
  jobId: string,
  options?: {
    includeStations?: boolean;
    includeProgress?: boolean;
    includeInactive?: boolean;
    includeWipBalances?: boolean;
  },
): Promise<JobItemWithDetails[]> {
  const supabase = createServiceSupabase();

  // Post Phase 5: station_id, production_line_id, kind columns removed from job_items
  // All job items are now pipeline-based with job_item_steps
  let selectParts = [
    "*",
    "pipeline_presets:pipeline_preset_id(id, name)",
  ];

  if (options?.includeStations) {
    selectParts.push("job_item_steps(*, stations(*))");
  }
  if (options?.includeProgress) {
    selectParts.push("job_item_progress(*)");
  }
  if (options?.includeWipBalances) {
    selectParts.push("wip_balances(*)");
  }

  let query = supabase
    .from("job_items")
    .select(selectParts.join(", "))
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch job items: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const item = row as unknown as JobItemRow;

    const jobItemSteps = (item.job_item_steps ?? [])
      .sort((a, b) => a.position - b.position)
      .map((jis) => ({
        id: jis.id,
        job_item_id: jis.job_item_id,
        station_id: jis.station_id,
        position: jis.position,
        is_terminal: jis.is_terminal,
        requires_first_product_approval: jis.requires_first_product_approval ?? false,
        created_at: jis.created_at,
        station: jis.stations ?? undefined,
      }));

    return {
      id: item.id,
      job_id: item.job_id,
      name: item.name,
      pipeline_preset_id: item.pipeline_preset_id,
      is_pipeline_locked: item.is_pipeline_locked,
      planned_quantity: item.planned_quantity,
      is_active: item.is_active,
      created_at: item.created_at,
      updated_at: item.updated_at,
      pipeline_preset: item.pipeline_presets ?? undefined,
      job_item_stations: options?.includeStations ? jobItemSteps : undefined,
      job_item_steps: options?.includeStations ? jobItemSteps : undefined,
      progress: item.job_item_progress ?? undefined,
      wip_balances: options?.includeWipBalances ? (item.wip_balances ?? []) : undefined,
    };
  });
}

/**
 * Get a job item by ID with full details.
 */
export async function getJobItemById(
  id: string,
): Promise<JobItemWithDetails | null> {
  const supabase = createServiceSupabase();

  // Post Phase 5: station_id, production_line_id, kind columns removed
  const { data, error } = await supabase
    .from("job_items")
    .select(`
      *,
      pipeline_presets:pipeline_preset_id(id, name),
      job_item_steps(*, stations(*)),
      job_item_progress(*)
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch job item: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const item = data as unknown as JobItemRow;

  const jobItemSteps = (item.job_item_steps ?? [])
    .sort((a, b) => a.position - b.position)
    .map((jis) => ({
      id: jis.id,
      job_item_id: jis.job_item_id,
      station_id: jis.station_id,
      position: jis.position,
      is_terminal: jis.is_terminal,
      requires_first_product_approval: jis.requires_first_product_approval ?? false,
      created_at: jis.created_at,
      station: jis.stations ?? undefined,
    }));

  return {
    id: item.id,
    job_id: item.job_id,
    name: item.name,
    pipeline_preset_id: item.pipeline_preset_id,
    is_pipeline_locked: item.is_pipeline_locked,
    planned_quantity: item.planned_quantity,
    is_active: item.is_active,
    created_at: item.created_at,
    updated_at: item.updated_at,
    pipeline_preset: item.pipeline_presets ?? undefined,
    job_item_stations: jobItemSteps,
    job_item_steps: jobItemSteps,
    progress: item.job_item_progress ?? undefined,
  };
}

/**
 * Get all stations associated with a job item.
 */
export async function getJobItemStations(
  jobItemId: string,
): Promise<JobItemStation[]> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("job_item_steps")
    .select("*, stations(*)")
    .eq("job_item_id", jobItemId)
    .order("position", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch job item stations: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const jis = row as JobItemStationRow;
    return {
      id: jis.id,
      job_item_id: jis.job_item_id,
      station_id: jis.station_id,
      position: jis.position,
      is_terminal: jis.is_terminal,
      requires_first_product_approval: jis.requires_first_product_approval ?? false,
      created_at: jis.created_at,
      station: jis.stations ?? undefined,
    };
  });
}

/**
 * Get all station IDs that are allowed for a job (union of all job item stations).
 * This is used for filtering the worker's station selection.
 * Uses a single query with join for better performance.
 */
export async function getJobAllowedStationIds(jobId: string): Promise<string[]> {
  const supabase = createServiceSupabase();

  // Single query with inner join to get all station IDs for active job items
  const { data, error } = await supabase
    .from("job_item_steps")
    .select("station_id, job_items!inner(job_id, is_active)")
    .eq("job_items.job_id", jobId)
    .eq("job_items.is_active", true);

  if (error) {
    throw new Error(`Failed to fetch job allowed stations: ${error.message}`);
  }

  // Return unique station IDs
  const stationIds = new Set((data ?? []).map((row) => row.station_id));
  return Array.from(stationIds);
}

/**
 * Check if a job has any active job items configured.
 */
export async function jobHasJobItems(jobId: string): Promise<boolean> {
  const supabase = createServiceSupabase();

  const { count, error } = await supabase
    .from("job_items")
    .select("*", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("is_active", true);

  if (error) {
    throw new Error(`Failed to check job items: ${error.message}`);
  }

  return (count ?? 0) > 0;
}

// ============================================
// JOB ITEM MUTATIONS
// ============================================

/**
 * Payload for creating a job item.
 * Post Phase 5: All items are pipeline-based. Must provide either:
 * - pipeline_preset_id (uses preset's stations)
 * - station_ids array (custom pipeline)
 */
export type CreateJobItemPayload = {
  job_id: string;
  name: string;  // Required product name
  pipeline_preset_id?: string | null;
  station_ids?: string[];  // Pipeline stations (required if no preset)
  /** Map of station_id -> requires_first_product_approval (optional) */
  first_product_approval_flags?: Record<string, boolean>;
  planned_quantity: number;
  is_active?: boolean;
};

/**
 * Create a new job item and initialize its stations/WIP.
 * Post Phase 5: All items are pipeline-based. Supports:
 * - preset-only: Uses pipeline_preset_id, calls rebuild_job_item_steps RPC
 * - custom stations: Uses station_ids array, manually creates job_item_steps and wip_balances
 */
export async function createJobItem(
  payload: CreateJobItemPayload,
): Promise<JobItemWithDetails> {
  const supabase = createServiceSupabase();

  // Validate required name
  if (!payload.name || payload.name.trim() === "") {
    throw new Error("JOB_ITEM_NAME_REQUIRED");
  }

  // Either station_ids or pipeline_preset_id must be provided
  const hasCustomStations = payload.station_ids && payload.station_ids.length > 0;
  if (!payload.pipeline_preset_id && !hasCustomStations) {
    throw new Error("JOB_ITEM_PIPELINE_STATIONS_REQUIRED");
  }

  // For preset (and no custom station_ids), verify the preset exists and has steps
  if (payload.pipeline_preset_id && !hasCustomStations) {
    const { data: preset, error: presetError } = await supabase
      .from("pipeline_presets")
      .select("id, is_active, pipeline_preset_steps(id, station_id, position)")
      .eq("id", payload.pipeline_preset_id)
      .maybeSingle();

    if (presetError) {
      throw new Error(`Failed to verify pipeline preset: ${presetError.message}`);
    }

    if (!preset || !preset.is_active) {
      throw new Error("PRESET_NOT_FOUND");
    }

    const steps = (preset as unknown as { pipeline_preset_steps: { id: string; station_id: string; position: number }[] }).pipeline_preset_steps;
    if (!steps || steps.length === 0) {
      throw new Error("PRESET_HAS_NO_STEPS");
    }
  }

  // Insert the job item (Post Phase 5: no kind, station_id, or production_line_id columns)
  const { data: insertedItem, error: insertError } = await supabase
    .from("job_items")
    .insert({
      job_id: payload.job_id,
      name: payload.name.trim(),
      pipeline_preset_id: payload.pipeline_preset_id ?? null,
      planned_quantity: payload.planned_quantity,
      is_active: payload.is_active ?? true,
    })
    .select("*")
    .single();

  if (insertError) {
    throw new Error(`Failed to create job item: ${insertError.message}`);
  }

  const jobItem = insertedItem as JobItem;

  // Handle station setup based on whether custom stations were provided
  if (hasCustomStations && payload.station_ids) {
    // Custom pipeline - manually insert job_item_steps and wip_balances
    try {
      const stationIds = payload.station_ids;
      const totalStations = stationIds.length;
      const approvalFlags = payload.first_product_approval_flags ?? {};

      // Insert job_item_steps
      const jobItemSteps = stationIds.map((stationId, index) => ({
        job_item_id: jobItem.id,
        station_id: stationId,
        position: index + 1,
        is_terminal: index === totalStations - 1,
        requires_first_product_approval: approvalFlags[stationId] ?? false,
      }));

      const { data: insertedSteps, error: stepsError } = await supabase
        .from("job_item_steps")
        .insert(jobItemSteps)
        .select("id, station_id, position");

      if (stepsError) {
        // Clean up the job item
        await supabase.from("job_items").delete().eq("id", jobItem.id);
        throw new Error(`Failed to create job item steps: ${stepsError.message}`);
      }

      // Insert wip_balances for each step
      const wipBalances = (insertedSteps ?? []).map((step) => ({
        job_item_id: jobItem.id,
        job_item_step_id: step.id,
        good_available: 0,
      }));

      const { error: wipError } = await supabase
        .from("wip_balances")
        .insert(wipBalances);

      if (wipError) {
        // Clean up the job item (cascade will handle steps)
        await supabase.from("job_items").delete().eq("id", jobItem.id);
        throw new Error(`Failed to create WIP balances: ${wipError.message}`);
      }

      // Insert job_item_progress row (the RPC does this but custom path needs it too)
      const { error: progressError } = await supabase
        .from("job_item_progress")
        .insert({
          job_item_id: jobItem.id,
          completed_good: 0,
        });

      if (progressError) {
        // Clean up the job item (cascade will handle steps and wip_balances)
        await supabase.from("job_items").delete().eq("id", jobItem.id);
        throw new Error(`Failed to create job item progress: ${progressError.message}`);
      }
    } catch (err) {
      // Clean up on any error
      await supabase.from("job_items").delete().eq("id", jobItem.id);
      throw err;
    }
  } else {
    // Standard flow - call RPC to set up job_item_steps and wip_balances
    // The RPC will use either production_line_id or pipeline_preset_id to get station list
    const { error: rpcError } = await supabase.rpc("rebuild_job_item_steps", {
      p_job_item_id: jobItem.id,
    });

    if (rpcError) {
      // Clean up the job item if RPC fails
      await supabase.from("job_items").delete().eq("id", jobItem.id);
      throw new Error(`Failed to initialize job item stations: ${rpcError.message}`);
    }
  }

  // Return the full job item with details
  const result = await getJobItemById(jobItem.id);
  if (!result) {
    throw new Error("Failed to fetch created job item");
  }

  return result;
}

export type UpdateJobItemPayload = Partial<{
  planned_quantity: number;
  is_active: boolean;
}>;

/**
 * Update a job item.
 * Note: Pipeline steps cannot be changed after creation (use rebuild_job_item_steps RPC if needed).
 */
export async function updateJobItem(
  id: string,
  payload: UpdateJobItemPayload,
): Promise<JobItem> {
  const supabase = createServiceSupabase();

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (payload.planned_quantity !== undefined) {
    if (payload.planned_quantity <= 0) {
      throw new Error("JOB_ITEM_INVALID_QUANTITY");
    }
    updateData.planned_quantity = payload.planned_quantity;
  }
  if (payload.is_active !== undefined) {
    updateData.is_active = payload.is_active;
  }

  const { data, error } = await supabase
    .from("job_items")
    .update(updateData)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update job item: ${error.message}`);
  }

  return data as JobItem;
}

/**
 * Check if a job item has active sessions.
 */
export async function jobItemHasActiveSessions(jobItemId: string): Promise<boolean> {
  const supabase = createServiceSupabase();

  const { count, error } = await supabase
    .from("sessions")
    .select("*", { count: "exact", head: true })
    .eq("job_item_id", jobItemId)
    .eq("status", "active");

  if (error) {
    throw new Error(`Failed to check active sessions: ${error.message}`);
  }

  return (count ?? 0) > 0;
}

/**
 * Delete a job item.
 * Fails if the job item has active sessions.
 */
export async function deleteJobItem(id: string): Promise<void> {
  const hasActive = await jobItemHasActiveSessions(id);
  if (hasActive) {
    throw new Error("JOB_ITEM_HAS_ACTIVE_SESSIONS");
  }

  const supabase = createServiceSupabase();

  // CASCADE will handle job_item_stations, wip_balances, wip_consumptions
  const { error } = await supabase.from("job_items").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete job item: ${error.message}`);
  }
}

// ============================================
// JOB ITEM STEP MUTATIONS
// ============================================

export type UpdateJobItemStepPayload = {
  requires_first_product_approval?: boolean;
};

/**
 * Update a job item step.
 * Allows toggling first product approval requirement.
 */
export async function updateJobItemStep(
  stepId: string,
  payload: UpdateJobItemStepPayload,
): Promise<JobItemStation> {
  const supabase = createServiceSupabase();

  const updateData: Record<string, unknown> = {};

  if (payload.requires_first_product_approval !== undefined) {
    updateData.requires_first_product_approval = payload.requires_first_product_approval;
  }

  if (Object.keys(updateData).length === 0) {
    // No changes - just fetch and return current state
    const { data, error } = await supabase
      .from("job_item_steps")
      .select("*, stations(*)")
      .eq("id", stepId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch job item step: ${error.message}`);
    }

    const row = data as JobItemStationRow;
    return {
      id: row.id,
      job_item_id: row.job_item_id,
      station_id: row.station_id,
      position: row.position,
      is_terminal: row.is_terminal,
      requires_first_product_approval: row.requires_first_product_approval ?? false,
      created_at: row.created_at,
      station: row.stations ?? undefined,
    };
  }

  const { data, error } = await supabase
    .from("job_item_steps")
    .update(updateData)
    .eq("id", stepId)
    .select("*, stations(*)")
    .single();

  if (error) {
    throw new Error(`Failed to update job item step: ${error.message}`);
  }

  const row = data as JobItemStationRow;
  return {
    id: row.id,
    job_item_id: row.job_item_id,
    station_id: row.station_id,
    position: row.position,
    is_terminal: row.is_terminal,
    requires_first_product_approval: row.requires_first_product_approval ?? false,
    created_at: row.created_at,
    station: row.stations ?? undefined,
  };
}

// ============================================
// WIP BALANCE QUERIES
// ============================================

/**
 * Get WIP balances for a job item.
 */
export async function getWipBalancesForJobItem(
  jobItemId: string,
): Promise<WipBalance[]> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("wip_balances")
    .select("*")
    .eq("job_item_id", jobItemId);

  if (error) {
    throw new Error(`Failed to fetch WIP balances: ${error.message}`);
  }

  return (data ?? []) as WipBalance[];
}

/**
 * Get the WIP balance for a specific step in a job item.
 */
export async function getWipBalanceForStep(
  jobItemId: string,
  jobItemStepId: string,
): Promise<WipBalance | null> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("wip_balances")
    .select("*")
    .eq("job_item_id", jobItemId)
    .eq("job_item_step_id", jobItemStepId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch WIP balance: ${error.message}`);
  }

  return (data as WipBalance) ?? null;
}

// ============================================
// JOB ITEM RESOLUTION (for session creation)
// ============================================

/**
 * Find the job item and step for a given job + station combination.
 * Returns null if no matching job item exists.
 */
export async function resolveJobItemForStation(
  jobId: string,
  stationId: string,
): Promise<{ jobItem: JobItem; jobItemStation: JobItemStation } | null> {
  const supabase = createServiceSupabase();

  // Find job items for this job that include this station
  const { data: jobItemStations, error } = await supabase
    .from("job_item_steps")
    .select(`
      *,
      job_items!inner(*)
    `)
    .eq("station_id", stationId)
    .eq("job_items.job_id", jobId)
    .eq("job_items.is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve job item: ${error.message}`);
  }

  if (!jobItemStations) {
    return null;
  }

  const row = jobItemStations as unknown as {
    id: string;
    job_item_id: string;
    station_id: string;
    position: number;
    is_terminal: boolean;
    created_at: string;
    job_items: JobItem;
  };

  return {
    jobItem: row.job_items,
    jobItemStation: {
      id: row.id,
      job_item_id: row.job_item_id,
      station_id: row.station_id,
      position: row.position,
      is_terminal: row.is_terminal,
      created_at: row.created_at,
    },
  };
}

/**
 * Get the upstream step's WIP balance for a job item station.
 * Returns null if this is the first step (no upstream).
 */
export async function getUpstreamWipBalance(
  jobItemId: string,
  currentPosition: number,
): Promise<{ balance: WipBalance; step: JobItemStation } | null> {
  if (currentPosition <= 1) {
    return null; // First step has no upstream
  }

  const supabase = createServiceSupabase();

  // Get the upstream step (position - 1)
  const { data: upstreamStep, error: stepError } = await supabase
    .from("job_item_steps")
    .select("*")
    .eq("job_item_id", jobItemId)
    .eq("position", currentPosition - 1)
    .maybeSingle();

  if (stepError) {
    throw new Error(`Failed to fetch upstream step: ${stepError.message}`);
  }

  if (!upstreamStep) {
    return null;
  }

  const step = upstreamStep as JobItemStation;

  // Get the WIP balance for the upstream step
  const { data: balance, error: balanceError } = await supabase
    .from("wip_balances")
    .select("*")
    .eq("job_item_id", jobItemId)
    .eq("job_item_step_id", step.id)
    .maybeSingle();

  if (balanceError) {
    throw new Error(`Failed to fetch upstream WIP balance: ${balanceError.message}`);
  }

  if (!balance) {
    return null;
  }

  return {
    balance: balance as WipBalance,
    step,
  };
}

// ============================================
// AVAILABLE JOBS FOR STATION (Deferred Job Selection)
// ============================================

export type AvailableJob = {
  id: string;
  jobNumber: string;
  clientName: string | null;
  description: string | null;
  jobItemCount: number;
};

/**
 * Get all jobs that have active job items for a specific station.
 * Used when worker enters production status and needs to select a job.
 */
export async function getAvailableJobsForStation(
  stationId: string,
): Promise<AvailableJob[]> {
  const supabase = createServiceSupabase();

  // Find all active job items that include this station, grouped by job
  const { data, error } = await supabase
    .from("job_item_steps")
    .select(`
      id,
      job_items!inner(
        id,
        job_id,
        is_active,
        planned_quantity,
        jobs:job_id(id, job_number, customer_name, description)
      )
    `)
    .eq("station_id", stationId)
    .eq("job_items.is_active", true);

  if (error) {
    throw new Error(`Failed to fetch available jobs: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Get per-step progress to filter out completed steps
  const stepIds = data.map((row) => {
    const typedRow = row as unknown as { id: string };
    return typedRow.id;
  });

  const { data: totalsData, error: totalsError } = await supabase
    .from("status_events")
    .select("job_item_step_id, quantity_good")
    .in("job_item_step_id", stepIds)
    .gt("quantity_good", 0);

  if (totalsError) {
    throw new Error(`Failed to fetch quantity totals: ${totalsError.message}`);
  }

  const completedByStep = new Map<string, number>();
  for (const event of totalsData ?? []) {
    const current = completedByStep.get(event.job_item_step_id) ?? 0;
    completedByStep.set(event.job_item_step_id, current + (event.quantity_good ?? 0));
  }

  // Group by job, only counting items where this step is not yet completed
  type JobRow = { id: string; job_number: string; customer_name: string | null; description: string | null };
  const jobMap = new Map<string, { job: JobRow; itemCount: number }>();

  for (const row of data ?? []) {
    const typedRow = row as unknown as {
      id: string;
      job_items: {
        id: string;
        job_id: string;
        planned_quantity: number;
        jobs: JobRow | null;
      };
    };

    if (!typedRow.job_items.jobs) continue;

    // Skip if this step is already completed
    const completedGood = completedByStep.get(typedRow.id) ?? 0;
    if (completedGood >= typedRow.job_items.planned_quantity) continue;

    const jobId = typedRow.job_items.jobs.id;
    const existing = jobMap.get(jobId);
    if (existing) {
      existing.itemCount++;
    } else {
      jobMap.set(jobId, { job: typedRow.job_items.jobs, itemCount: 1 });
    }
  }

  return Array.from(jobMap.values()).map(({ job, itemCount }) => ({
    id: job.id,
    jobNumber: job.job_number,
    clientName: job.customer_name,
    description: job.description,
    jobItemCount: itemCount,
  }));
}

export type AvailableJobItem = {
  id: string;
  jobId: string;
  name: string;
  plannedQuantity: number;
  completedGood: number;
  remaining: number;
  /** @deprecated Use jobItemStepId */
  jobItemStationId: string;
  jobItemStepId: string;
};

/**
 * Get job items for a specific job that include a specific station.
 * Used when worker selects a job and needs to choose a job item.
 *
 * Progress is per-step: completedGood reflects only what THIS station
 * has reported. Items where this step is fully completed are filtered out.
 */
export async function getJobItemsForStationAndJob(
  stationId: string,
  jobId: string,
): Promise<AvailableJobItem[]> {
  const supabase = createServiceSupabase();

  // Post Phase 5: Find job items that include this station (via job_item_steps)
  const { data, error } = await supabase
    .from("job_item_steps")
    .select(`
      id,
      job_item_id,
      job_items!inner(
        id,
        job_id,
        name,
        planned_quantity,
        is_active,
        pipeline_presets:pipeline_preset_id(name)
      )
    `)
    .eq("station_id", stationId)
    .eq("job_items.job_id", jobId)
    .eq("job_items.is_active", true);

  if (error) {
    throw new Error(`Failed to fetch job items: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Get the step IDs (job_item_steps.id) for this station's steps
  const stepIds = data.map((row) => {
    const typedRow = row as unknown as { id: string };
    return typedRow.id;
  });

  // Fetch completed quantities from status_events filtered by step ID (per-step progress)
  const { data: totalsData, error: totalsError } = await supabase
    .from("status_events")
    .select("job_item_step_id, quantity_good")
    .in("job_item_step_id", stepIds)
    .gt("quantity_good", 0);

  if (totalsError) {
    throw new Error(`Failed to fetch quantity totals: ${totalsError.message}`);
  }

  // Sum quantities per step (per-station progress, not global)
  const completedByStep = new Map<string, number>();
  for (const event of totalsData ?? []) {
    const current = completedByStep.get(event.job_item_step_id) ?? 0;
    completedByStep.set(event.job_item_step_id, current + (event.quantity_good ?? 0));
  }

  return data
    .map((row) => {
      const typedRow = row as unknown as {
        id: string;
        job_item_id: string;
        job_items: {
          id: string;
          job_id: string;
          name: string;
          planned_quantity: number;
          pipeline_presets: { name: string } | null;
        };
      };

      const item = typedRow.job_items;
      // Per-step completed: only what THIS station has reported
      const completedGood = completedByStep.get(typedRow.id) ?? 0;
      const name = item.name || item.pipeline_presets?.name || "מוצר";

      return {
        id: item.id,
        jobId: item.job_id,
        name,
        plannedQuantity: item.planned_quantity,
        completedGood,
        remaining: Math.max(0, item.planned_quantity - completedGood),
        jobItemStationId: typedRow.id,
        jobItemStepId: typedRow.id,
      };
    })
    .filter((item) => item.remaining > 0);
}

// ============================================
// STATION JOB ITEM COUNTS (Station-First Flow)
// ============================================

/**
 * Get count of uncompleted job items for each station assigned to a worker.
 * Used for station-first selection flow to show job availability per station.
 *
 * Uses per-step progress: a job item is "uncompleted" at a station only if
 * that station's step has not yet reached planned_quantity.
 */
export async function getJobItemCountsByStation(
  workerId: string,
): Promise<Map<string, number>> {
  const supabase = createServiceSupabase();

  // 1. Get worker's assigned station IDs
  const { data: workerStations, error: workerError } = await supabase
    .from("worker_stations")
    .select("station_id")
    .eq("worker_id", workerId);

  if (workerError) {
    throw new Error(`Failed to fetch worker stations: ${workerError.message}`);
  }

  const stationIds = (workerStations ?? []).map((ws) => ws.station_id);
  if (stationIds.length === 0) {
    return new Map();
  }

  // 2. Get all active job items at these stations (include step id for per-step progress)
  const { data, error } = await supabase
    .from("job_item_steps")
    .select(`
      id,
      station_id,
      job_items!inner(
        id,
        is_active,
        planned_quantity
      )
    `)
    .in("station_id", stationIds)
    .eq("job_items.is_active", true);

  if (error) {
    throw new Error(`Failed to fetch job item counts: ${error.message}`);
  }

  if (!data || data.length === 0) {
    // Initialize all stations with 0
    const countMap = new Map<string, number>();
    for (const stationId of stationIds) {
      countMap.set(stationId, 0);
    }
    return countMap;
  }

  // 3. Get step IDs and fetch per-step totals from status_events
  const stepIds = data.map((row) => {
    const typedRow = row as unknown as { id: string };
    return typedRow.id;
  });

  const { data: totalsData, error: totalsError } = await supabase
    .from("status_events")
    .select("job_item_step_id, quantity_good")
    .in("job_item_step_id", stepIds)
    .gt("quantity_good", 0);

  if (totalsError) {
    throw new Error(`Failed to fetch quantity totals: ${totalsError.message}`);
  }

  // Sum quantities per step (per-station progress)
  const completedByStep = new Map<string, number>();
  for (const event of totalsData ?? []) {
    const current = completedByStep.get(event.job_item_step_id) ?? 0;
    completedByStep.set(event.job_item_step_id, current + (event.quantity_good ?? 0));
  }

  // 4. Count uncompleted items per station
  const countMap = new Map<string, number>();

  // Initialize all stations with 0
  for (const stationId of stationIds) {
    countMap.set(stationId, 0);
  }

  // Count items where this step's completed < planned
  for (const row of data) {
    const typedRow = row as unknown as {
      id: string;
      station_id: string;
      job_items: {
        id: string;
        planned_quantity: number;
      };
    };

    const completedGood = completedByStep.get(typedRow.id) ?? 0;
    const plannedQuantity = typedRow.job_items.planned_quantity;

    // Only count if this station's step is not completed
    if (completedGood < plannedQuantity) {
      const current = countMap.get(typedRow.station_id) ?? 0;
      countMap.set(typedRow.station_id, current + 1);
    }
  }

  return countMap;
}

/**
 * Get all job items available at a specific station (for station-first flow sheet).
 * Returns job items with progress info, grouped by job.
 *
 * Progress is per-step: completedGood reflects only what THIS station
 * has reported. Items where this step is fully completed are filtered out.
 */
export async function getJobItemsAtStation(
  stationId: string,
): Promise<{
  id: string;
  jobId: string;
  jobNumber: string;
  customerName: string | null;
  name: string;
  plannedQuantity: number;
  completedGood: number;
  jobItemStepId: string;
}[]> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("job_item_steps")
    .select(`
      id,
      job_items!inner(
        id,
        job_id,
        name,
        planned_quantity,
        is_active,
        jobs:job_id(id, job_number, customer_name)
      )
    `)
    .eq("station_id", stationId)
    .eq("job_items.is_active", true);

  if (error) {
    throw new Error(`Failed to fetch job items at station: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Get step IDs for per-step progress calculation
  const stepIds = data.map((row) => {
    const typedRow = row as unknown as { id: string };
    return typedRow.id;
  });

  const { data: totalsData, error: totalsError } = await supabase
    .from("status_events")
    .select("job_item_step_id, quantity_good")
    .in("job_item_step_id", stepIds)
    .gt("quantity_good", 0);

  if (totalsError) {
    throw new Error(`Failed to fetch quantity totals: ${totalsError.message}`);
  }

  // Sum quantities per step (per-station progress)
  const completedByStep = new Map<string, number>();
  for (const event of totalsData ?? []) {
    const current = completedByStep.get(event.job_item_step_id) ?? 0;
    completedByStep.set(event.job_item_step_id, current + (event.quantity_good ?? 0));
  }

  return data
    .map((row) => {
      const typedRow = row as unknown as {
        id: string;
        job_items: {
          id: string;
          job_id: string;
          name: string;
          planned_quantity: number;
          jobs: { id: string; job_number: string; customer_name: string | null } | null;
        };
      };

      const item = typedRow.job_items;
      const completedGood = completedByStep.get(typedRow.id) ?? 0;
      return {
        id: item.id,
        jobId: item.job_id,
        jobNumber: item.jobs?.job_number ?? "",
        customerName: item.jobs?.customer_name ?? null,
        name: item.name,
        plannedQuantity: item.planned_quantity,
        completedGood,
        jobItemStepId: typedRow.id,
      };
    })
    .filter((item) => item.completedGood < item.plannedQuantity);
}

// ============================================
// STATION SELECTION (Worker Flow)
// ============================================

type ActiveSessionInfo = {
  id: string;
  worker_id: string;
  station_id: string;
  last_seen_at: string | null;
  started_at: string;
  workers: { id: string; full_name: string } | null;
};

/**
 * Fetch job items structured for station selection UI.
 * Returns job items with all pipeline stations, marking which ones
 * the worker is assigned to and their occupancy status.
 */
export async function fetchJobItemsForStationSelection(
  jobId: string,
  workerId: string,
): Promise<StationSelectionJobItem[]> {
  const supabase = createServiceSupabase();

  // 1. Fetch job items with stations and production line info
  const jobItems = await fetchJobItemsForJob(jobId, {
    includeStations: true,
    includeInactive: false,
  });

  if (jobItems.length === 0) {
    return [];
  }

  // 2. Get worker's assigned station IDs
  const { data: workerStations, error: workerError } = await supabase
    .from("worker_stations")
    .select("station_id")
    .eq("worker_id", workerId);

  if (workerError) {
    throw new Error(`Failed to fetch worker stations: ${workerError.message}`);
  }

  const workerStationIds = new Set(
    (workerStations ?? []).map((ws) => ws.station_id)
  );

  // 3. Collect all station IDs from job items for occupancy check
  const allStationIds = new Set<string>();
  for (const item of jobItems) {
    if (item.job_item_stations) {
      for (const jis of item.job_item_stations) {
        allStationIds.add(jis.station_id);
      }
    }
  }

  // 4. Fetch occupancy for all stations
  const stationOccupancyMap = new Map<string, StationOccupancy>();

  if (allStationIds.size > 0) {
    const graceCutoff = new Date(Date.now() - SESSION_GRACE_MS).toISOString();

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
      .in("station_id", Array.from(allStationIds))
      .eq("status", "active")
      .is("ended_at", null)
      .is("forced_closed_at", null)
      .or(`last_seen_at.gt.${graceCutoff},started_at.gt.${graceCutoff}`);

    if (sessionsError) {
      throw new Error(`Failed to fetch active sessions: ${sessionsError.message}`);
    }

    // Build occupancy map
    const now = Date.now();
    const sessionByStation = new Map<string, ActiveSessionInfo>();
    for (const session of activeSessions ?? []) {
      const typedSession = session as unknown as ActiveSessionInfo;
      const existing = sessionByStation.get(typedSession.station_id);
      if (!existing || typedSession.started_at > existing.started_at) {
        sessionByStation.set(typedSession.station_id, typedSession);
      }
    }

    // Populate occupancy for all stations
    for (const stationId of allStationIds) {
      const activeSession = sessionByStation.get(stationId);

      if (!activeSession) {
        stationOccupancyMap.set(stationId, {
          isOccupied: false,
          isGracePeriod: false,
        });
        continue;
      }

      const lastSeenSource = activeSession.last_seen_at ?? activeSession.started_at;
      const lastSeenMs = new Date(lastSeenSource).getTime();
      const graceExpiresAtMs = lastSeenMs + SESSION_GRACE_MS;
      const isGracePeriod = now > lastSeenMs + 30_000; // Grace if no heartbeat for 30s
      const isOwnSession = activeSession.worker_id === workerId;

      stationOccupancyMap.set(stationId, {
        isOccupied: !isOwnSession,
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
      });
    }
  }

  // 5. Build the response structure
  return jobItems.map((item): StationSelectionJobItem => {
    const pipelineStations: PipelineStationOption[] = (item.job_item_stations ?? [])
      .sort((a, b) => a.position - b.position)
      .map((jis): PipelineStationOption => ({
        id: jis.station_id,
        name: jis.station?.name ?? "Unknown",
        code: jis.station?.code ?? "",
        position: jis.position,
        isTerminal: jis.is_terminal,
        isWorkerAssigned: workerStationIds.has(jis.station_id),
        occupancy: stationOccupancyMap.get(jis.station_id) ?? {
          isOccupied: false,
          isGracePeriod: false,
        },
        jobItemStationId: jis.id,
        jobItemStepId: jis.id,
      }));

    // Post Phase 5: Use explicit name, fallback to preset name
    const name = item.name || item.pipeline_preset?.name || "מוצר";

    return {
      id: item.id,
      name,
      plannedQuantity: item.planned_quantity,
      pipelineStations,
    };
  });
}
