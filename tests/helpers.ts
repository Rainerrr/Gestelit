import { createServiceSupabase } from "@/lib/supabase/client";
import { testId } from "./setup";

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
};

/**
 * Get Supabase client for direct queries in tests
 */
export function getTestSupabase() {
  return supabase;
}
