import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createSession, startStatusEvent, closeActiveSessionsForWorker } from "@/lib/data/sessions";
import { TestFactory, TestCleanup, getTestSupabase } from "../helpers";

describe("Quantity Reporting", () => {
  // Test fixtures
  let testWorker: { id: string };
  let testWorker2: { id: string };
  let testStation: { id: string };
  let testJob: { id: string };
  let productionStatus: { id: string };
  let stoppageStatus: { id: string };

  // Track created resources for cleanup
  const createdSessionIds: string[] = [];

  beforeAll(async () => {
    // Create test fixtures
    testWorker = await TestFactory.createWorker("qty_report");
    testWorker2 = await TestFactory.createWorker("qty_report2");
    testStation = await TestFactory.createStation("qty_report");
    testJob = await TestFactory.createJob("qty_report");
    productionStatus = await TestFactory.getProductionStatus();
    stoppageStatus = await TestFactory.getStoppageStatus();
  });

  // Close active sessions before each test to ensure isolation
  beforeEach(async () => {
    if (testWorker?.id) {
      const closedIds = await closeActiveSessionsForWorker(testWorker.id);
      createdSessionIds.push(...closedIds);
    }
    if (testWorker2?.id) {
      const closedIds = await closeActiveSessionsForWorker(testWorker2.id);
      createdSessionIds.push(...closedIds);
    }
  });

  afterAll(async () => {
    // Cleanup in reverse order of dependencies
    await TestCleanup.cleanupSessions(createdSessionIds);
    await TestCleanup.cleanupJobs([testJob.id]);
    await TestCleanup.cleanupStations([testStation.id]);
    await TestCleanup.cleanupWorkers([testWorker.id, testWorker2.id]);
  });

  it("should create status event with zero quantities by default", async () => {
    const supabase = getTestSupabase();

    const session = await createSession({
      worker_id: testWorker.id,
      station_id: testStation.id,
      job_id: testJob.id,
    });
    createdSessionIds.push(session.id);

    // Create a production status event
    const statusEvent = await startStatusEvent({
      session_id: session.id,
      status_definition_id: productionStatus.id,
    });

    expect(statusEvent).toBeDefined();

    // Verify quantities are 0 by default
    const { data: event } = await supabase
      .from("status_events")
      .select("quantity_good, quantity_scrap")
      .eq("id", statusEvent.id)
      .single();

    expect(event?.quantity_good).toBe(0);
    expect(event?.quantity_scrap).toBe(0);
  });

  it("should update status event quantities via end_production_status_atomic RPC", async () => {
    const supabase = getTestSupabase();

    // Create session
    const session = await createSession({
      worker_id: testWorker.id,
      station_id: testStation.id,
      job_id: testJob.id,
    });
    createdSessionIds.push(session.id);

    // Enter production
    const productionEvent = await startStatusEvent({
      session_id: session.id,
      status_definition_id: productionStatus.id,
    });

    // End production with quantities
    const quantityGood = 50;
    const quantityScrap = 5;

    const { data: result, error } = await supabase.rpc("end_production_status_atomic", {
      p_session_id: session.id,
      p_status_event_id: productionEvent.id,
      p_quantity_good: quantityGood,
      p_quantity_scrap: quantityScrap,
      p_next_status_id: stoppageStatus.id,
    });

    expect(error).toBeNull();
    expect(result).toBeDefined();
    expect(result.newStatusEvent).toBeDefined();

    // Verify production event was updated with quantities
    const { data: updatedEvent } = await supabase
      .from("status_events")
      .select("quantity_good, quantity_scrap, ended_at")
      .eq("id", productionEvent.id)
      .single();

    expect(updatedEvent?.quantity_good).toBe(quantityGood);
    expect(updatedEvent?.quantity_scrap).toBe(quantityScrap);
    expect(updatedEvent?.ended_at).toBeDefined();

    // Verify session totals were updated
    const { data: updatedSession } = await supabase
      .from("sessions")
      .select("total_good, total_scrap, current_status_id")
      .eq("id", session.id)
      .single();

    expect(updatedSession?.total_good).toBe(quantityGood);
    expect(updatedSession?.total_scrap).toBe(quantityScrap);
    expect(updatedSession?.current_status_id).toBe(stoppageStatus.id);
  });

  it("should accumulate quantities across multiple production periods", async () => {
    const supabase = getTestSupabase();

    // Create session
    const session = await createSession({
      worker_id: testWorker.id,
      station_id: testStation.id,
      job_id: testJob.id,
    });
    createdSessionIds.push(session.id);

    // First production period
    const prod1 = await startStatusEvent({
      session_id: session.id,
      status_definition_id: productionStatus.id,
    });

    await supabase.rpc("end_production_status_atomic", {
      p_session_id: session.id,
      p_status_event_id: prod1.id,
      p_quantity_good: 30,
      p_quantity_scrap: 3,
      p_next_status_id: stoppageStatus.id,
    });

    // Second production period
    const prod2 = await startStatusEvent({
      session_id: session.id,
      status_definition_id: productionStatus.id,
    });

    await supabase.rpc("end_production_status_atomic", {
      p_session_id: session.id,
      p_status_event_id: prod2.id,
      p_quantity_good: 20,
      p_quantity_scrap: 2,
      p_next_status_id: stoppageStatus.id,
    });

    // Verify accumulated totals
    const { data: finalSession } = await supabase
      .from("sessions")
      .select("total_good, total_scrap")
      .eq("id", session.id)
      .single();

    expect(finalSession?.total_good).toBe(50); // 30 + 20
    expect(finalSession?.total_scrap).toBe(5);  // 3 + 2
  });

  it("should reject ending already-ended status event", async () => {
    const supabase = getTestSupabase();

    // Create session
    const session = await createSession({
      worker_id: testWorker.id,
      station_id: testStation.id,
      job_id: testJob.id,
    });
    createdSessionIds.push(session.id);

    // Enter production
    const productionEvent = await startStatusEvent({
      session_id: session.id,
      status_definition_id: productionStatus.id,
    });

    // End production first time
    await supabase.rpc("end_production_status_atomic", {
      p_session_id: session.id,
      p_status_event_id: productionEvent.id,
      p_quantity_good: 10,
      p_quantity_scrap: 1,
      p_next_status_id: stoppageStatus.id,
    });

    // Try to end the same event again
    const { error } = await supabase.rpc("end_production_status_atomic", {
      p_session_id: session.id,
      p_status_event_id: productionEvent.id,
      p_quantity_good: 20,
      p_quantity_scrap: 2,
      p_next_status_id: stoppageStatus.id,
    });

    expect(error).toBeDefined();
    expect(error?.message).toContain("STATUS_EVENT_ALREADY_ENDED");
  });

  it("should reject mismatched session/event IDs", async () => {
    const supabase = getTestSupabase();

    // Create two sessions with different workers (unique_active_session_per_worker constraint)
    const session1 = await createSession({
      worker_id: testWorker.id,
      station_id: testStation.id,
      job_id: testJob.id,
    });
    createdSessionIds.push(session1.id);

    const session2 = await createSession({
      worker_id: testWorker2.id,  // Different worker to allow concurrent sessions
      station_id: testStation.id,
      job_id: testJob.id,
    });
    createdSessionIds.push(session2.id);

    // Enter production on session 1
    const productionEvent = await startStatusEvent({
      session_id: session1.id,
      status_definition_id: productionStatus.id,
    });

    // Try to end with wrong session ID
    const { error } = await supabase.rpc("end_production_status_atomic", {
      p_session_id: session2.id, // Wrong session!
      p_status_event_id: productionEvent.id,
      p_quantity_good: 10,
      p_quantity_scrap: 1,
      p_next_status_id: stoppageStatus.id,
    });

    expect(error).toBeDefined();
    expect(error?.message).toContain("STATUS_EVENT_SESSION_MISMATCH");
  });
});
