import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function createServiceSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function cleanupTestArtifacts() {
  const supabase = createServiceSupabase();

  console.log("Cleaning up test artifacts...\n");

  // 1. Find test workers
  const { data: testWorkers } = await supabase
    .from("workers")
    .select("id, worker_code")
    .or("worker_code.like.test_%,worker_code.like.%_test_%");

  console.log(`Found ${testWorkers?.length || 0} test workers`);

  // 2. Find test stations
  const { data: testStations } = await supabase
    .from("stations")
    .select("id, code")
    .or("code.like.test_%,code.like.QA_STATION_%,code.like.%_test_%");

  console.log(`Found ${testStations?.length || 0} test stations`);

  // 3. Find test jobs
  const { data: testJobs } = await supabase
    .from("jobs")
    .select("id, job_number")
    .or("job_number.like.test_%,job_number.like.%_test_%");

  console.log(`Found ${testJobs?.length || 0} test jobs`);

  const workerIds = testWorkers?.map((w) => w.id) || [];
  const stationIds = testStations?.map((s) => s.id) || [];
  const jobIds = testJobs?.map((j) => j.id) || [];

  // 4. Find sessions for test workers
  if (workerIds.length > 0) {
    const { data: sessions } = await supabase
      .from("sessions")
      .select("id")
      .in("worker_id", workerIds);

    const sessionIds = sessions?.map((s) => s.id) || [];
    console.log(`Found ${sessionIds.length} test sessions`);

    if (sessionIds.length > 0) {
      // Delete status events for test sessions
      const { error: seError } = await supabase
        .from("status_events")
        .delete()
        .in("session_id", sessionIds);
      if (seError) console.error("Error deleting status_events:", seError.message);
      else console.log("  Deleted status_events for test sessions");

      // Delete test sessions
      const { error: sessError } = await supabase
        .from("sessions")
        .delete()
        .in("id", sessionIds);
      if (sessError) console.error("Error deleting sessions:", sessError.message);
      else console.log("  Deleted test sessions");
    }
  }

  // 5. Delete reports for test stations
  if (stationIds.length > 0) {
    const { error: repError } = await supabase
      .from("reports")
      .delete()
      .in("station_id", stationIds);
    if (repError) console.error("Error deleting reports:", repError.message);
    else console.log("  Deleted reports for test stations");
  }

  // 6. Delete job items and related data for test jobs
  if (jobIds.length > 0) {
    const { data: jobItems } = await supabase
      .from("job_items")
      .select("id")
      .in("job_id", jobIds);

    const jobItemIds = jobItems?.map((ji) => ji.id) || [];
    console.log(`Found ${jobItemIds.length} test job items`);

    if (jobItemIds.length > 0) {
      // Delete wip_consumptions
      const { error: wcError } = await supabase
        .from("wip_consumptions")
        .delete()
        .in("job_item_id", jobItemIds);
      if (wcError) console.error("Error deleting wip_consumptions:", wcError.message);
      else console.log("  Deleted wip_consumptions");

      // Delete job_item_progress
      const { error: jipError } = await supabase
        .from("job_item_progress")
        .delete()
        .in("job_item_id", jobItemIds);
      if (jipError) console.error("Error deleting job_item_progress:", jipError.message);
      else console.log("  Deleted job_item_progress");

      // Delete wip_balances
      const { error: wbError } = await supabase
        .from("wip_balances")
        .delete()
        .in("job_item_id", jobItemIds);
      if (wbError) console.error("Error deleting wip_balances:", wbError.message);
      else console.log("  Deleted wip_balances");

      // Delete job_item_steps
      const { error: jisError } = await supabase
        .from("job_item_steps")
        .delete()
        .in("job_item_id", jobItemIds);
      if (jisError) console.error("Error deleting job_item_steps:", jisError.message);
      else console.log("  Deleted job_item_steps");

      // Delete job_items
      const { error: jiError } = await supabase
        .from("job_items")
        .delete()
        .in("id", jobItemIds);
      if (jiError) console.error("Error deleting job_items:", jiError.message);
      else console.log("  Deleted job_items");
    }

    // Delete test jobs
    const { error: jobError } = await supabase
      .from("jobs")
      .delete()
      .in("id", jobIds);
    if (jobError) console.error("Error deleting jobs:", jobError.message);
    else console.log("  Deleted test jobs");
  }

  // 7. Delete test stations
  if (stationIds.length > 0) {
    const { error: stError } = await supabase
      .from("stations")
      .delete()
      .in("id", stationIds);
    if (stError) console.error("Error deleting stations:", stError.message);
    else console.log("  Deleted test stations");
  }

  // 8. Delete test workers
  if (workerIds.length > 0) {
    const { error: wkError } = await supabase
      .from("workers")
      .delete()
      .in("id", workerIds);
    if (wkError) console.error("Error deleting workers:", wkError.message);
    else console.log("  Deleted test workers");
  }

  // 9. Delete test pipeline presets
  const { data: testPresets } = await supabase
    .from("pipeline_presets")
    .select("id, name")
    .or("name.like.test_%,name.like.%_test_%");

  if (testPresets && testPresets.length > 0) {
    const presetIds = testPresets.map((p) => p.id);
    console.log(`Found ${presetIds.length} test pipeline presets`);

    const { error: ppsError } = await supabase
      .from("pipeline_preset_steps")
      .delete()
      .in("pipeline_preset_id", presetIds);
    if (ppsError) console.error("Error deleting pipeline_preset_steps:", ppsError.message);
    else console.log("  Deleted pipeline_preset_steps");

    const { error: ppError } = await supabase
      .from("pipeline_presets")
      .delete()
      .in("id", presetIds);
    if (ppError) console.error("Error deleting pipeline_presets:", ppError.message);
    else console.log("  Deleted test pipeline presets");
  }

  console.log("\nCleanup complete!");

  // Verify cleanup
  const { data: remainingWorkers } = await supabase
    .from("workers")
    .select("id")
    .or("worker_code.like.test_%,worker_code.like.%_test_%");

  const { data: remainingStations } = await supabase
    .from("stations")
    .select("id")
    .or("code.like.test_%,code.like.QA_STATION_%,code.like.%_test_%");

  const { data: remainingJobs } = await supabase
    .from("jobs")
    .select("id")
    .or("job_number.like.test_%,job_number.like.%_test_%");

  console.log("\nRemaining test artifacts:");
  console.log(`  Workers: ${remainingWorkers?.length || 0}`);
  console.log(`  Stations: ${remainingStations?.length || 0}`);
  console.log(`  Jobs: ${remainingJobs?.length || 0}`);
}

cleanupTestArtifacts().catch(console.error);
