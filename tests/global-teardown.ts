import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import path from "path";

/**
 * Global teardown that runs after ALL tests complete.
 * Cleans up any test data that matches the test_ prefix pattern.
 * This is a safety net for when individual test cleanup fails.
 */
export default async function globalTeardown() {
  // Load environment variables
  config({ path: path.resolve(process.cwd(), ".env.local") });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn("⚠️  Missing Supabase credentials, skipping global cleanup");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log("\n🧹 Running global test cleanup...");

  let totalDeleted = 0;

  try {
    // 1. Delete reports linked to sessions from test workers
    const { count: reportsCount } = await supabase.rpc("cleanup_test_reports");
    // Fallback: direct delete if RPC doesn't exist
    const { count: reportsDirect } = await supabase
      .from("reports")
      .delete({ count: "exact" })
      .filter(
        "session_id",
        "in",
        supabase
          .from("sessions")
          .select("id")
          .filter("worker_id", "in",
            supabase.from("workers").select("id").like("worker_code", "test_%")
          )
      );

    // 2. Delete status_events for sessions linked to test workers/stations
    // Use subquery approach - delete where session has test worker
    const { data: testWorkerIds } = await supabase
      .from("workers")
      .select("id")
      .like("worker_code", "test_%");

    const { data: testStationIds } = await supabase
      .from("stations")
      .select("id")
      .like("code", "test_%");

    const workerIds = testWorkerIds?.map((w) => w.id) ?? [];
    const stationIds = testStationIds?.map((s) => s.id) ?? [];

    // Get session IDs to delete (test workers, test stations, or orphaned)
    let sessionIdsToDelete: string[] = [];

    if (workerIds.length > 0) {
      const { data: workerSessions } = await supabase
        .from("sessions")
        .select("id")
        .in("worker_id", workerIds);
      sessionIdsToDelete.push(...(workerSessions?.map((s) => s.id) ?? []));
    }

    if (stationIds.length > 0) {
      const { data: stationSessions } = await supabase
        .from("sessions")
        .select("id")
        .in("station_id", stationIds);
      sessionIdsToDelete.push(...(stationSessions?.map((s) => s.id) ?? []));
    }

    // Also get orphaned sessions (null worker AND null station)
    const { data: orphanedSessions } = await supabase
      .from("sessions")
      .select("id")
      .is("worker_id", null)
      .is("station_id", null);
    sessionIdsToDelete.push(...(orphanedSessions?.map((s) => s.id) ?? []));

    // Dedupe
    sessionIdsToDelete = [...new Set(sessionIdsToDelete)];

    // Delete status_events for these sessions
    if (sessionIdsToDelete.length > 0) {
      await supabase.from("status_events").delete().in("session_id", sessionIdsToDelete);

      // Delete reports for these sessions
      await supabase.from("reports").delete().in("session_id", sessionIdsToDelete);

      // Delete the sessions
      const { count: sessionsCount } = await supabase
        .from("sessions")
        .delete({ count: "exact" })
        .in("id", sessionIdsToDelete);
      totalDeleted += sessionsCount ?? 0;
    }

    // 3. Get test job IDs
    const { data: testJobs } = await supabase
      .from("jobs")
      .select("id")
      .like("job_number", "test_%");

    const jobIds = testJobs?.map((j) => j.id) ?? [];

    // 4. Get test job item IDs
    if (jobIds.length > 0) {
      const { data: testJobItems } = await supabase
        .from("job_items")
        .select("id")
        .in("job_id", jobIds);

      const jobItemIds = testJobItems?.map((ji) => ji.id) ?? [];

      if (jobItemIds.length > 0) {
        // Delete WIP data
        await supabase.from("wip_consumptions").delete().in("job_item_id", jobItemIds);
        await supabase.from("job_item_progress").delete().in("job_item_id", jobItemIds);

        // Delete job items (cascades to steps, wip_balances)
        const { count: jobItemsCount } = await supabase
          .from("job_items")
          .delete({ count: "exact" })
          .in("id", jobItemIds);
        totalDeleted += jobItemsCount ?? 0;
      }

      // Delete test jobs
      const { count: jobsCount } = await supabase
        .from("jobs")
        .delete({ count: "exact" })
        .in("id", jobIds);
      totalDeleted += jobsCount ?? 0;
    }

    // 5. Delete test pipeline presets
    const { data: testPresets } = await supabase
      .from("pipeline_presets")
      .select("id")
      .like("name", "test_%");

    const presetIds = testPresets?.map((p) => p.id) ?? [];

    if (presetIds.length > 0) {
      await supabase.from("pipeline_preset_steps").delete().in("pipeline_preset_id", presetIds);

      const { count: presetsCount } = await supabase
        .from("pipeline_presets")
        .delete({ count: "exact" })
        .in("id", presetIds);
      totalDeleted += presetsCount ?? 0;
    }

    // 6. Delete test stations (must be after sessions that reference them)
    if (stationIds.length > 0) {
      const { count: stationsCount } = await supabase
        .from("stations")
        .delete({ count: "exact" })
        .in("id", stationIds);
      totalDeleted += stationsCount ?? 0;
    }

    // 7. Delete test workers (must be after sessions that reference them)
    if (workerIds.length > 0) {
      const { count: workersCount } = await supabase
        .from("workers")
        .delete({ count: "exact" })
        .in("id", workerIds);
      totalDeleted += workersCount ?? 0;
    }

    if (totalDeleted > 0) {
      console.log(`✅ Cleaned up ${totalDeleted} test records`);
    } else {
      console.log("✅ No test data to clean up");
    }
  } catch (error) {
    console.error("❌ Global cleanup failed:", error);
    // Don't throw - cleanup failure shouldn't fail the test run
  }
}
