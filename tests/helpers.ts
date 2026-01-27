import { createServiceSupabase } from "@/lib/supabase/client";
import { testId } from "./setup";
import type { JobItem, JobItemStation, Session, StatusEvent } from "@/lib/types";

const supabase = createServiceSupabase();

/**
 * Test data factory for creating test fixtures
 */
export const TestFactory = {
  /**
   * Create a test worker
   */
  async createWorker(suffix: string = "worker") {
    const code = testId(suffix);
    const { data, error } = await supabase
      .from("workers")
      .insert({
        worker_code: code,
        full_name: `Test Worker ${suffix}`,
        is_active: true,
      })
      .select("*")
      .single();

    if (error) throw new Error(`Failed to create test worker: ${error.message}`);
    return data;
  },

  /**
   * Create a test station
   */
  async createStation(suffix: string = "station") {
    const code = testId(suffix);
    const { data, error } = await supabase
      .from("stations")
      .insert({
        name: `Test Station ${suffix}`,
        code: code,
        station_type: "other",
        is_active: true,
      })
      .select("*")
      .single();

    if (error) throw new Error(`Failed to create test station: ${error.message}`);
    return data;
  },

  /**
   * Create a test job
   */
  async createJob(suffix: string = "job") {
    const jobNumber = testId(suffix);
    const { data, error } = await supabase
      .from("jobs")
      .insert({
        job_number: jobNumber,
        customer_name: "Test Customer",
        description: "Test job for integration tests",
      })
      .select("*")
      .single();

    if (error) throw new Error(`Failed to create test job: ${error.message}`);
    return data;
  },

  /**
   * Get the first available global status definition
   */
  async getGlobalStatus() {
    const { data, error } = await supabase
      .from("status_definitions")
      .select("*")
      .eq("scope", "global")
      .limit(1)
      .single();

    if (error) throw new Error(`Failed to get global status: ${error.message}`);
    return data;
  },

  /**
   * Get a stoppage status definition
   */
  async getStoppageStatus() {
    const { data, error } = await supabase
      .from("status_definitions")
      .select("*")
      .eq("machine_state", "stoppage")
      .limit(1)
      .single();

    if (error) throw new Error(`Failed to get stoppage status: ${error.message}`);
    return data;
  },

  /**
   * Get production status definition
   */
  async getProductionStatus() {
    const { data, error } = await supabase
      .from("status_definitions")
      .select("*")
      .eq("machine_state", "production")
      .limit(1)
      .single();

    if (error) throw new Error(`Failed to get production status: ${error.message}`);
    return data;
  },

  /**
   * Create a test job item
   */
  async createJobItem(
    jobId: string,
    suffix: string = "item",
    options?: {
      plannedQuantity?: number;
      name?: string;
    },
  ): Promise<JobItem> {
    const { data, error } = await supabase
      .from("job_items")
      .insert({
        job_id: jobId,
        name: options?.name ?? `Test Item ${suffix}`,
        planned_quantity: options?.plannedQuantity ?? 100,
        is_active: true,
      })
      .select("*")
      .single();

    if (error) throw new Error(`Failed to create test job item: ${error.message}`);
    return data as JobItem;
  },

  /**
   * Create a pipeline for a job item using the setup_job_item_pipeline RPC.
   * Returns the created job_item_steps.
   */
  async createPipeline(
    jobItemId: string,
    stationIds: string[],
    presetId?: string,
  ): Promise<{ steps: JobItemStation[] }> {
    const { error: rpcError } = await supabase.rpc("setup_job_item_pipeline", {
      p_job_item_id: jobItemId,
      p_station_ids: stationIds,
      p_preset_id: presetId ?? null,
    });

    if (rpcError) throw new Error(`Failed to create pipeline: ${rpcError.message}`);

    // Fetch the created steps
    const { data: steps, error: stepsError } = await supabase
      .from("job_item_steps")
      .select("*, stations(*)")
      .eq("job_item_id", jobItemId)
      .order("position", { ascending: true });

    if (stepsError) throw new Error(`Failed to fetch pipeline steps: ${stepsError.message}`);

    return {
      steps: (steps ?? []).map((s) => ({
        id: s.id,
        job_item_id: s.job_item_id,
        station_id: s.station_id,
        position: s.position,
        is_terminal: s.is_terminal,
        created_at: s.created_at,
        station: s.stations ?? undefined,
      })),
    };
  },

  /**
   * Create a production session with job item binding and enter production status.
   * Returns the session and the initial production status event.
   */
  async createProductionSession(
    workerId: string,
    stationId: string,
    jobId: string,
    jobItemId: string,
    jobItemStepId: string,
  ): Promise<{ session: Session; productionEvent: StatusEvent }> {
    // Get production status
    const productionStatus = await this.getProductionStatus();
    const instanceId = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Create session with job item binding using atomic RPC
    const { data: session, error: sessionError } = await supabase.rpc("create_session_atomic", {
      p_worker_id: workerId,
      p_station_id: stationId,
      p_job_id: jobId,
      p_instance_id: instanceId,
      p_job_item_id: jobItemId,
      p_job_item_step_id: jobItemStepId,
      p_initial_status_id: productionStatus.id,
    });

    if (sessionError) throw new Error(`Failed to create production session: ${sessionError.message}`);

    const sessionId = session.id;

    // Fetch the session
    const { data: sessionData, error: fetchError } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (fetchError) throw new Error(`Failed to fetch session: ${fetchError.message}`);

    // The session starts with stop/initial status, we need to transition to production
    // Create a production status event
    const { data: eventData, error: rpcError } = await supabase.rpc("create_status_event_atomic", {
      p_session_id: sessionId,
      p_status_definition_id: productionStatus.id,
    });

    if (rpcError) throw new Error(`Failed to enter production status: ${rpcError.message}`);

    return {
      session: sessionData as Session,
      productionEvent: eventData as StatusEvent,
    };
  },

  /**
   * Report quantities by ending a production status and creating a new status.
   * Returns the newly created status event.
   */
  async reportQuantities(
    sessionId: string,
    statusEventId: string,
    quantityGood: number,
    quantityScrap: number,
    nextStatusId: string,
  ): Promise<{ newStatusEvent: StatusEvent }> {
    const { data, error } = await supabase.rpc("end_production_status_atomic", {
      p_session_id: sessionId,
      p_status_event_id: statusEventId,
      p_quantity_good: quantityGood,
      p_quantity_scrap: quantityScrap,
      p_next_status_id: nextStatusId,
    });

    if (error) throw new Error(`Failed to report quantities: ${error.message}`);

    // Fetch the new status event
    const { data: eventData, error: eventError } = await supabase
      .from("status_events")
      .select("*")
      .eq("id", data.newStatusEvent.id)
      .single();

    if (eventError) throw new Error(`Failed to fetch new status event: ${eventError.message}`);

    return { newStatusEvent: eventData as StatusEvent };
  },

  /**
   * Get WIP balance for a specific job item step
   */
  async getWipBalance(
    jobItemId: string,
    jobItemStepId: string,
  ): Promise<{ good_available: number } | null> {
    const { data, error } = await supabase
      .from("wip_balances")
      .select("good_available")
      .eq("job_item_id", jobItemId)
      .eq("job_item_step_id", jobItemStepId)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch WIP balance: ${error.message}`);
    return data;
  },

  /**
   * Get job item progress
   */
  async getJobItemProgress(jobItemId: string): Promise<{ completed_good: number } | null> {
    const { data, error } = await supabase
      .from("job_item_progress")
      .select("completed_good")
      .eq("job_item_id", jobItemId)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch job item progress: ${error.message}`);
    return data;
  },

  /**
   * Get WIP consumptions for a job item
   */
  async getWipConsumptions(jobItemId: string): Promise<
    {
      from_job_item_step_id: string;
      consuming_session_id: string;
      good_used: number;
      is_scrap: boolean;
    }[]
  > {
    const { data, error } = await supabase
      .from("wip_consumptions")
      .select("from_job_item_step_id, consuming_session_id, good_used, is_scrap")
      .eq("job_item_id", jobItemId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(`Failed to fetch WIP consumptions: ${error.message}`);
    return data ?? [];
  },

  /**
   * Create a pipeline preset
   */
  async createPipelinePreset(
    suffix: string = "preset",
    stationIds: string[],
  ): Promise<{ id: string; name: string }> {
    const name = testId(suffix);
    const { data: preset, error: presetError } = await supabase
      .from("pipeline_presets")
      .insert({
        name,
        description: `Test pipeline preset ${suffix}`,
        is_active: true,
      })
      .select("id, name")
      .single();

    if (presetError) throw new Error(`Failed to create pipeline preset: ${presetError.message}`);

    // Create preset steps
    const steps = stationIds.map((stationId, index) => ({
      pipeline_preset_id: preset.id,
      station_id: stationId,
      position: index + 1,
    }));

    const { error: stepsError } = await supabase
      .from("pipeline_preset_steps")
      .insert(steps);

    if (stepsError) throw new Error(`Failed to create preset steps: ${stepsError.message}`);

    return preset;
  },
};

/**
 * Cleanup helper to remove test data after tests
 */
export const TestCleanup = {
  /**
   * Delete test sessions and related data
   */
  async cleanupSessions(sessionIds: string[]) {
    if (sessionIds.length === 0) return;

    // Delete status events first (FK constraint)
    await supabase
      .from("status_events")
      .delete()
      .in("session_id", sessionIds);

    // Delete sessions
    await supabase
      .from("sessions")
      .delete()
      .in("id", sessionIds);
  },

  /**
   * Delete test workers
   */
  async cleanupWorkers(workerIds: string[]) {
    if (workerIds.length === 0) return;
    await supabase.from("workers").delete().in("id", workerIds);
  },

  /**
   * Delete test stations
   */
  async cleanupStations(stationIds: string[]) {
    if (stationIds.length === 0) return;
    await supabase.from("stations").delete().in("id", stationIds);
  },

  /**
   * Delete test jobs
   */
  async cleanupJobs(jobIds: string[]) {
    if (jobIds.length === 0) return;
    await supabase.from("jobs").delete().in("id", jobIds);
  },

  /**
   * Delete test reports
   */
  async cleanupReports(reportIds: string[]) {
    if (reportIds.length === 0) return;
    await supabase.from("reports").delete().in("id", reportIds);
  },

  /**
   * Delete test status definitions (non-protected only)
   */
  async cleanupStatusDefinitions(statusIds: string[]) {
    if (statusIds.length === 0) return;
    await supabase
      .from("status_definitions")
      .delete()
      .in("id", statusIds)
      .eq("is_protected", false);
  },

  /**
   * Delete test job items and related data (steps, wip_balances, progress, consumptions)
   */
  async cleanupJobItems(jobItemIds: string[]) {
    if (jobItemIds.length === 0) return;

    // Delete in order: consumptions -> progress -> balances -> steps -> items
    // Note: CASCADE should handle most of this, but being explicit
    await supabase
      .from("wip_consumptions")
      .delete()
      .in("job_item_id", jobItemIds);

    await supabase
      .from("job_item_progress")
      .delete()
      .in("job_item_id", jobItemIds);

    // wip_balances and job_item_steps are deleted by CASCADE from job_items
    await supabase.from("job_items").delete().in("id", jobItemIds);
  },

  /**
   * Delete test pipeline presets
   */
  async cleanupPipelinePresets(presetIds: string[]) {
    if (presetIds.length === 0) return;

    // Delete steps first
    await supabase
      .from("pipeline_preset_steps")
      .delete()
      .in("pipeline_preset_id", presetIds);

    await supabase.from("pipeline_presets").delete().in("id", presetIds);
  },

  /**
   * Comprehensive cleanup for pipeline tests
   */
  async cleanupPipelineTest(options: {
    sessionIds?: string[];
    jobItemIds?: string[];
    jobIds?: string[];
    stationIds?: string[];
    workerIds?: string[];
    presetIds?: string[];
  }) {
    // Order matters: clean up in reverse order of dependencies
    if (options.sessionIds?.length) {
      await this.cleanupSessions(options.sessionIds);
    }
    if (options.jobItemIds?.length) {
      await this.cleanupJobItems(options.jobItemIds);
    }
    if (options.jobIds?.length) {
      await this.cleanupJobs(options.jobIds);
    }
    if (options.presetIds?.length) {
      await this.cleanupPipelinePresets(options.presetIds);
    }
    if (options.stationIds?.length) {
      await this.cleanupStations(options.stationIds);
    }
    if (options.workerIds?.length) {
      await this.cleanupWorkers(options.workerIds);
    }
  },
};

/**
 * Get Supabase client for direct queries in tests
 */
export function getTestSupabase() {
  return supabase;
}
