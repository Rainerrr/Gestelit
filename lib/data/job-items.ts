import { createServiceSupabase } from "@/lib/supabase/client";
import { SESSION_GRACE_MS } from "@/lib/constants";
import type {
  JobItem,
  JobItemKind,
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
};

type ProductionLinePartial = {
  id: string;
  name: string;
  code?: string | null;
  is_active?: boolean;
};

type JobItemRow = JobItem & {
  stations?: Station | null;
  production_lines?: ProductionLinePartial | null;
  job_item_stations?: JobItemStationRow[];
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

  let selectParts = [
    "*",
    "stations:station_id(*)",
    "production_lines:production_line_id(id, name, code)",
  ];

  if (options?.includeStations) {
    selectParts.push("job_item_stations(*, stations(*))");
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

    const jobItemStations = (item.job_item_stations ?? [])
      .sort((a, b) => a.position - b.position)
      .map((jis) => ({
        id: jis.id,
        job_item_id: jis.job_item_id,
        station_id: jis.station_id,
        position: jis.position,
        is_terminal: jis.is_terminal,
        created_at: jis.created_at,
        station: jis.stations ?? undefined,
      }));

    return {
      id: item.id,
      job_id: item.job_id,
      kind: item.kind,
      station_id: item.station_id,
      production_line_id: item.production_line_id,
      planned_quantity: item.planned_quantity,
      is_active: item.is_active,
      created_at: item.created_at,
      updated_at: item.updated_at,
      station: item.stations ?? undefined,
      production_line: item.production_lines ?? undefined,
      job_item_stations: options?.includeStations ? jobItemStations : undefined,
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

  const { data, error } = await supabase
    .from("job_items")
    .select(`
      *,
      stations:station_id(*),
      production_lines:production_line_id(id, name, code),
      job_item_stations(*, stations(*)),
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

  const jobItemStations = (item.job_item_stations ?? [])
    .sort((a, b) => a.position - b.position)
    .map((jis) => ({
      id: jis.id,
      job_item_id: jis.job_item_id,
      station_id: jis.station_id,
      position: jis.position,
      is_terminal: jis.is_terminal,
      created_at: jis.created_at,
      station: jis.stations ?? undefined,
    }));

  return {
    id: item.id,
    job_id: item.job_id,
    kind: item.kind,
    station_id: item.station_id,
    production_line_id: item.production_line_id,
    planned_quantity: item.planned_quantity,
    is_active: item.is_active,
    created_at: item.created_at,
    updated_at: item.updated_at,
    station: item.stations ?? undefined,
    production_line: item.production_lines ?? undefined,
    job_item_stations: jobItemStations,
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
    .from("job_item_stations")
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
    .from("job_item_stations")
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

export type CreateJobItemPayload = {
  job_id: string;
  kind: JobItemKind;
  station_id?: string | null;
  production_line_id?: string | null;
  planned_quantity: number;
  is_active?: boolean;
};

/**
 * Create a new job item and initialize its stations/WIP.
 * Calls the rebuild_job_item_stations RPC to set up job_item_stations and wip_balances.
 */
export async function createJobItem(
  payload: CreateJobItemPayload,
): Promise<JobItemWithDetails> {
  const supabase = createServiceSupabase();

  // Validate the XOR constraint
  if (payload.kind === "station" && !payload.station_id) {
    throw new Error("JOB_ITEM_STATION_REQUIRED");
  }
  if (payload.kind === "line" && !payload.production_line_id) {
    throw new Error("JOB_ITEM_LINE_REQUIRED");
  }
  if (payload.kind === "station" && payload.production_line_id) {
    throw new Error("JOB_ITEM_INVALID_XOR");
  }
  if (payload.kind === "line" && payload.station_id) {
    throw new Error("JOB_ITEM_INVALID_XOR");
  }

  // Check for duplicate job items (same job + same station/line)
  let duplicateQuery = supabase
    .from("job_items")
    .select("id")
    .eq("job_id", payload.job_id)
    .eq("is_active", true);

  if (payload.kind === "station") {
    duplicateQuery = duplicateQuery.eq("station_id", payload.station_id);
  } else {
    duplicateQuery = duplicateQuery.eq("production_line_id", payload.production_line_id);
  }

  const { data: existingItem, error: dupError } = await duplicateQuery.maybeSingle();

  if (dupError) {
    throw new Error(`Failed to check for duplicate job items: ${dupError.message}`);
  }

  if (existingItem) {
    throw new Error("JOB_ITEM_DUPLICATE");
  }

  // Insert the job item
  const { data: insertedItem, error: insertError } = await supabase
    .from("job_items")
    .insert({
      job_id: payload.job_id,
      kind: payload.kind,
      station_id: payload.kind === "station" ? payload.station_id : null,
      production_line_id: payload.kind === "line" ? payload.production_line_id : null,
      planned_quantity: payload.planned_quantity,
      is_active: payload.is_active ?? true,
    })
    .select("*")
    .single();

  if (insertError) {
    throw new Error(`Failed to create job item: ${insertError.message}`);
  }

  const jobItem = insertedItem as JobItem;

  // Call RPC to set up job_item_stations and wip_balances
  const { error: rpcError } = await supabase.rpc("rebuild_job_item_stations", {
    p_job_item_id: jobItem.id,
  });

  if (rpcError) {
    // Clean up the job item if RPC fails
    await supabase.from("job_items").delete().eq("id", jobItem.id);
    throw new Error(`Failed to initialize job item stations: ${rpcError.message}`);
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
 * Note: kind, station_id, and production_line_id cannot be changed after creation.
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
  jobItemStationId: string,
): Promise<WipBalance | null> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("wip_balances")
    .select("*")
    .eq("job_item_id", jobItemId)
    .eq("job_item_station_id", jobItemStationId)
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
    .from("job_item_stations")
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
    .from("job_item_stations")
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
    .eq("job_item_station_id", step.id)
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
    .from("job_item_stations")
    .select(`
      job_items!inner(
        job_id,
        is_active,
        jobs:job_id(id, job_number, customer_name, description)
      )
    `)
    .eq("station_id", stationId)
    .eq("job_items.is_active", true);

  if (error) {
    throw new Error(`Failed to fetch available jobs: ${error.message}`);
  }

  // Group by job and count items
  type JobRow = { id: string; job_number: string; customer_name: string | null; description: string | null };
  const jobMap = new Map<string, { job: JobRow; itemCount: number }>();

  for (const row of data ?? []) {
    const jobItems = row.job_items as unknown as {
      job_id: string;
      jobs: JobRow | null;
    };

    if (!jobItems.jobs) continue;

    const jobId = jobItems.jobs.id;
    const existing = jobMap.get(jobId);
    if (existing) {
      existing.itemCount++;
    } else {
      jobMap.set(jobId, { job: jobItems.jobs, itemCount: 1 });
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
  kind: JobItemKind;
  plannedQuantity: number;
  completedGood: number;
  remaining: number;
  jobItemStationId: string;
};

/**
 * Get job items for a specific job that include a specific station.
 * Used when worker selects a job and needs to choose a job item.
 */
export async function getJobItemsForStationAndJob(
  stationId: string,
  jobId: string,
): Promise<AvailableJobItem[]> {
  const supabase = createServiceSupabase();

  // Find job items that include this station
  const { data, error } = await supabase
    .from("job_item_stations")
    .select(`
      id,
      job_item_id,
      job_items!inner(
        id,
        job_id,
        kind,
        planned_quantity,
        is_active,
        stations:station_id(name),
        production_lines:production_line_id(name),
        job_item_progress(completed_good)
      )
    `)
    .eq("station_id", stationId)
    .eq("job_items.job_id", jobId)
    .eq("job_items.is_active", true);

  if (error) {
    throw new Error(`Failed to fetch job items: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const typedRow = row as unknown as {
      id: string;
      job_item_id: string;
      job_items: {
        id: string;
        job_id: string;
        kind: JobItemKind;
        planned_quantity: number;
        stations: { name: string } | null;
        production_lines: { name: string } | null;
        job_item_progress: { completed_good: number } | null;
      };
    };

    const item = typedRow.job_items;
    const completedGood = item.job_item_progress?.completed_good ?? 0;
    const name = item.kind === "line"
      ? item.production_lines?.name ?? "Production Line"
      : item.stations?.name ?? "Station";

    return {
      id: item.id,
      jobId: item.job_id,
      name,
      kind: item.kind,
      plannedQuantity: item.planned_quantity,
      completedGood,
      remaining: Math.max(0, item.planned_quantity - completedGood),
      jobItemStationId: typedRow.id,
    };
  });
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
      }));

    // Determine the display name
    const name =
      item.kind === "line"
        ? item.production_line?.name ?? "Production Line"
        : item.station?.name ?? "Station";

    return {
      id: item.id,
      kind: item.kind,
      name,
      plannedQuantity: item.planned_quantity,
      pipelineStations,
    };
  });
}
