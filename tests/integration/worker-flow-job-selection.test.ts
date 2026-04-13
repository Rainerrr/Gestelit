import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createSession, closeActiveSessionsForWorker } from "@/lib/data/sessions";
import { bindJobItemToSession, unbindJobItemFromSession, getJobItemAccumulatedTime } from "@/lib/data/sessions";
import { getAvailableJobsForStation, getJobItemsForStationAndJob } from "@/lib/data/job-items";
import { TestFactory, TestCleanup, getTestSupabase } from "../helpers";

describe("Worker Flow - Job Selection", () => {
  // Test fixtures
  let testWorker: { id: string };
  let testStation: { id: string };
  let testJob: { id: string };
  let testJobItem: { id: string };
  let testJobItemStep: { id: string };

  // Track created resources for cleanup
  const createdSessionIds: string[] = [];
  const createdJobItemIds: string[] = [];
  const createdJobItemStepIds: string[] = [];

  beforeAll(async () => {
    const supabase = getTestSupabase();

    // Create test fixtures
    testWorker = await TestFactory.createWorker("job_select");
    testStation = await TestFactory.createStation("job_select");
    testJob = await TestFactory.createJob("job_select");

    // Create a job item (pipeline-based schema - no kind column)
    // Post Phase 5: All job items are pipeline-based with a name column
    const { data: jobItem, error: jobItemError } = await supabase
      .from("job_items")
      .insert({
        job_id: testJob.id,
        name: "Test Product",
        planned_quantity: 100,
        is_active: true,
      })
      .select("*")
      .single();

    if (jobItemError) throw new Error(`Failed to create job item: ${jobItemError.message}`);
    testJobItem = jobItem;
    createdJobItemIds.push(jobItem.id);

    // Create job_item_steps entry (pipeline step)
    const { data: jis, error: jisError } = await supabase
      .from("job_item_steps")
      .insert({
        job_item_id: testJobItem.id,
        station_id: testStation.id,
        position: 1,
        is_terminal: true,
      })
      .select("*")
      .single();

    if (jisError) throw new Error(`Failed to create job_item_step: ${jisError.message}`);
    testJobItemStep = jis;
    createdJobItemStepIds.push(jis.id);

    // Create WIP balance entry
    await supabase.from("wip_balances").insert({
      job_item_id: testJobItem.id,
      job_item_step_id: testJobItemStep.id,
      good_reported: 0,
      scrap_reported: 0,
    });

    // Create job_item_progress entry
    await supabase.from("job_item_progress").insert({
      job_item_id: testJobItem.id,
      completed_good: 0,
    });
  });

  // Close any active sessions before each test to avoid unique constraint violations
  beforeEach(async () => {
    if (testWorker?.id) {
      const closedIds = await closeActiveSessionsForWorker(testWorker.id);
      // Track closed sessions for cleanup
      createdSessionIds.push(...closedIds);
    }
  });

  afterAll(async () => {
    const supabase = getTestSupabase();

    // Cleanup in reverse order of dependencies
    await TestCleanup.cleanupSessions(createdSessionIds);

    // Cleanup WIP balances
    if (createdJobItemStepIds.length > 0) {
      await supabase.from("wip_balances").delete().in("job_item_step_id", createdJobItemStepIds);
    }

    // Cleanup job_item_progress
    if (createdJobItemIds.length > 0) {
      await supabase.from("job_item_progress").delete().in("job_item_id", createdJobItemIds);
    }

    // Cleanup job_item_steps
    if (createdJobItemStepIds.length > 0) {
      await supabase.from("job_item_steps").delete().in("id", createdJobItemStepIds);
    }

    // Cleanup job_items
    if (createdJobItemIds.length > 0) {
      await supabase.from("job_items").delete().in("id", createdJobItemIds);
    }

    await TestCleanup.cleanupJobs([testJob.id]);
    await TestCleanup.cleanupStations([testStation.id]);
    await TestCleanup.cleanupWorkers([testWorker.id]);
  });

  it("should create session without job binding (deferred job selection)", async () => {
    const session = await createSession({
      worker_id: testWorker.id,
      station_id: testStation.id,
      job_id: null, // No job at session creation
    });

    createdSessionIds.push(session.id);

    expect(session).toBeDefined();
    expect(session.id).toBeDefined();
    expect(session.worker_id).toBe(testWorker.id);
    expect(session.station_id).toBe(testStation.id);
    expect(session.job_id).toBeNull();
    expect(session.job_item_id).toBeNull();
    expect(session.job_item_step_id).toBeNull();
    expect(session.status).toBe("active");
  });

  it("should return available jobs for a station", async () => {
    const jobs = await getAvailableJobsForStation(testStation.id);

    expect(jobs).toBeDefined();
    expect(Array.isArray(jobs)).toBe(true);

    // Should find our test job
    const foundJob = jobs.find((j) => j.id === testJob.id);
    expect(foundJob).toBeDefined();
    expect(foundJob?.jobNumber).toBeDefined();
    expect(foundJob?.jobItemCount).toBeGreaterThan(0);
  });

  it("should return job items for a station+job combo", async () => {
    const jobItems = await getJobItemsForStationAndJob(testStation.id, testJob.id);

    expect(jobItems).toBeDefined();
    expect(Array.isArray(jobItems)).toBe(true);
    expect(jobItems.length).toBeGreaterThan(0);

    const foundItem = jobItems.find((ji) => ji.id === testJobItem.id);
    expect(foundItem).toBeDefined();
    expect(foundItem?.jobItemStepId).toBe(testJobItemStep.id);
    expect(foundItem?.plannedQuantity).toBe(100);
  });

  it("should bind job item to existing session", async () => {
    // Create session without job
    const session = await createSession({
      worker_id: testWorker.id,
      station_id: testStation.id,
      job_id: null,
    });
    createdSessionIds.push(session.id);

    // Bind job item to session
    const { session: updatedSession } = await bindJobItemToSession(
      session.id,
      testJob.id,
      testJobItem.id,
      testJobItemStep.id,
    );

    expect(updatedSession).toBeDefined();
    expect(updatedSession.job_id).toBe(testJob.id);
    expect(updatedSession.job_item_id).toBe(testJobItem.id);
    expect(updatedSession.job_item_step_id).toBe(testJobItemStep.id);

    // Verify in database
    const supabase = getTestSupabase();
    const { data: dbSession } = await supabase
      .from("sessions")
      .select("job_id, job_item_id, job_item_step_id")
      .eq("id", session.id)
      .single();

    expect(dbSession?.job_id).toBe(testJob.id);
    expect(dbSession?.job_item_id).toBe(testJobItem.id);
    expect(dbSession?.job_item_step_id).toBe(testJobItemStep.id);
  });

  it("should not return jobs without job items for the station", async () => {
    const supabase = getTestSupabase();

    // Create a job without any job items for our test station
    const { data: emptyJob } = await supabase
      .from("jobs")
      .insert({
        job_number: `TEST_EMPTY_${Date.now()}`,
        customer_name: "Test No Items",
      })
      .select("*")
      .single();

    if (!emptyJob) {
      throw new Error("Failed to create empty job");
    }

    try {
      const jobs = await getAvailableJobsForStation(testStation.id);

      // The empty job should NOT appear in the list
      const foundEmptyJob = jobs.find((j) => j.id === emptyJob.id);
      expect(foundEmptyJob).toBeUndefined();
    } finally {
      // Cleanup
      await supabase.from("jobs").delete().eq("id", emptyJob.id);
    }
  });

  describe("Independent job item binding", () => {
    it("should set current_job_item_started_at when binding", async () => {
      const session = await createSession({
        worker_id: testWorker.id,
        station_id: testStation.id,
        job_id: null,
      });
      createdSessionIds.push(session.id);

      const before = Date.now();
      await bindJobItemToSession(
        session.id,
        testJob.id,
        testJobItem.id,
        testJobItemStep.id,
      );

      const supabase = getTestSupabase();
      const { data: dbSession } = await supabase
        .from("sessions")
        .select("current_job_item_started_at, job_item_id")
        .eq("id", session.id)
        .single();

      expect(dbSession?.job_item_id).toBe(testJobItem.id);
      expect(dbSession?.current_job_item_started_at).toBeTruthy();
      const startedAt = new Date(dbSession!.current_job_item_started_at!).getTime();
      expect(startedAt).toBeGreaterThanOrEqual(before - 5000);
      expect(startedAt).toBeLessThanOrEqual(Date.now() + 5000);
    });

    it("should unbind job item and clear timer fields", async () => {
      const session = await createSession({
        worker_id: testWorker.id,
        station_id: testStation.id,
        job_id: null,
      });
      createdSessionIds.push(session.id);

      // Bind first
      await bindJobItemToSession(
        session.id,
        testJob.id,
        testJobItem.id,
        testJobItemStep.id,
      );

      // Unbind
      await unbindJobItemFromSession(session.id);

      const supabase = getTestSupabase();
      const { data: dbSession } = await supabase
        .from("sessions")
        .select("job_item_id, job_item_step_id, job_id, current_job_item_started_at")
        .eq("id", session.id)
        .single();

      expect(dbSession?.job_item_id).toBeNull();
      expect(dbSession?.job_item_step_id).toBeNull();
      expect(dbSession?.current_job_item_started_at).toBeNull();
    });

    it("should return accumulated timer seconds", async () => {
      const supabase = getTestSupabase();

      const session = await createSession({
        worker_id: testWorker.id,
        station_id: testStation.id,
        job_id: null,
      });
      createdSessionIds.push(session.id);

      // Bind job item
      await bindJobItemToSession(
        session.id,
        testJob.id,
        testJobItem.id,
        testJobItemStep.id,
      );

      // Get the default "ייצור" status definition for creating events
      const { data: prodStatus } = await supabase
        .from("status_definitions")
        .select("id")
        .eq("is_protected", true)
        .eq("machine_state", "production")
        .limit(1)
        .single();

      if (!prodStatus) throw new Error("No production status found");

      // Create a completed status event (simulate some elapsed time)
      const eventStart = new Date(Date.now() - 10_000).toISOString(); // 10 seconds ago
      const eventEnd = new Date(Date.now() - 5_000).toISOString(); // 5 seconds ago

      const { data: event } = await supabase
        .from("status_events")
        .insert({
          session_id: session.id,
          status_definition_id: prodStatus.id,
          job_item_id: testJobItem.id,
          started_at: eventStart,
          ended_at: eventEnd,
        })
        .select("id")
        .single();

      try {
        const timer = await getJobItemAccumulatedTime(session.id, testJobItem.id);

        expect(timer.accumulatedSeconds).toBeGreaterThanOrEqual(4); // ~5 seconds, allow for rounding
        expect(timer.accumulatedSeconds).toBeLessThanOrEqual(10);
        expect(timer.segmentStart).toBeTruthy(); // Job item is still bound
      } finally {
        // Cleanup the status event
        if (event?.id) {
          await supabase.from("status_events").delete().eq("id", event.id);
        }
      }
    });
  });
});
