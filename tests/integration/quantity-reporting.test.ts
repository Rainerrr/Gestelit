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

    // Verify session's current_status_id was updated
    const { data: updatedSession } = await supabase
      .from("sessions")
      .select("current_status_id")
      .eq("id", session.id)
      .single();

    expect(updatedSession?.current_status_id).toBe(stoppageStatus.id);

    // Session totals are now derived from status_events (no longer stored on sessions)
    // Verify by summing status_events for this session
    const { data: totals } = await supabase
      .from("status_events")
      .select("quantity_good, quantity_scrap")
      .eq("session_id", session.id);

    const totalGood = (totals ?? []).reduce((sum, e) => sum + (e.quantity_good ?? 0), 0);
    const totalScrap = (totals ?? []).reduce((sum, e) => sum + (e.quantity_scrap ?? 0), 0);

    expect(totalGood).toBe(quantityGood);
    expect(totalScrap).toBe(quantityScrap);
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

    // Verify accumulated totals (derived from status_events)
    const { data: events } = await supabase
      .from("status_events")
      .select("quantity_good, quantity_scrap")
      .eq("session_id", session.id);

    const totalGood = (events ?? []).reduce((sum, e) => sum + (e.quantity_good ?? 0), 0);
    const totalScrap = (events ?? []).reduce((sum, e) => sum + (e.quantity_scrap ?? 0), 0);

    expect(totalGood).toBe(50); // 30 + 20
    expect(totalScrap).toBe(5);  // 3 + 2
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

/**
 * WIP Integration Tests
 *
 * These tests verify that quantity reporting correctly updates WIP balances
 * through the end_production_status_atomic RPC function.
 */
describe("Quantity Reporting with WIP Integration", () => {
  // Additional test fixtures for WIP tests
  let testWorker: { id: string };
  let testStation: { id: string };
  let testStation2: { id: string };
  let testJob: { id: string };
  let productionStatus: { id: string };
  let stoppageStatus: { id: string };

  // Track created resources for cleanup
  const createdSessionIds: string[] = [];
  const createdJobItemIds: string[] = [];

  beforeAll(async () => {
    testWorker = await TestFactory.createWorker("qty_wip");
    testStation = await TestFactory.createStation("qty_wip_s1");
    testStation2 = await TestFactory.createStation("qty_wip_s2");
    testJob = await TestFactory.createJob("qty_wip");
    productionStatus = await TestFactory.getProductionStatus();
    stoppageStatus = await TestFactory.getStoppageStatus();
  });

  beforeEach(async () => {
    if (testWorker?.id) {
      const closedIds = await closeActiveSessionsForWorker(testWorker.id);
      createdSessionIds.push(...closedIds);
    }
  });

  afterAll(async () => {
    await TestCleanup.cleanupPipelineTest({
      sessionIds: createdSessionIds,
      jobItemIds: createdJobItemIds,
      jobIds: [testJob.id],
      stationIds: [testStation.id, testStation2.id],
      workerIds: [testWorker.id],
    });
  });

  it("should update WIP balance when reporting quantities for pipeline session", async () => {
    const supabase = getTestSupabase();

    // Create job item with single-station pipeline
    const jobItem = await TestFactory.createJobItem(testJob.id, "qty_wip_single");
    createdJobItemIds.push(jobItem.id);

    const { steps } = await TestFactory.createPipeline(jobItem.id, [testStation.id]);

    // Create production session with job item binding
    const { session, productionEvent } = await TestFactory.createProductionSession(
      testWorker.id,
      testStation.id,
      testJob.id,
      jobItem.id,
      steps[0].id,
    );
    createdSessionIds.push(session.id);

    // Report quantities
    const quantityGood = 75;
    const quantityScrap = 8;

    await TestFactory.reportQuantities(
      session.id,
      productionEvent.id,
      quantityGood,
      quantityScrap,
      stoppageStatus.id,
    );

    // Verify WIP balance was updated
    const balance = await TestFactory.getWipBalance(jobItem.id, steps[0].id);
    expect(balance?.good_available).toBe(quantityGood);

    // Since it's a terminal station (single-station pipeline), verify progress
    const progress = await TestFactory.getJobItemProgress(jobItem.id);
    expect(progress?.completed_good).toBe(quantityGood);
  });

  it("should record job_item_id on status event when ending production", async () => {
    const supabase = getTestSupabase();

    // Create job item
    const jobItem = await TestFactory.createJobItem(testJob.id, "qty_wip_capture");
    createdJobItemIds.push(jobItem.id);

    const { steps } = await TestFactory.createPipeline(jobItem.id, [testStation.id]);

    // Create production session
    const { session, productionEvent } = await TestFactory.createProductionSession(
      testWorker.id,
      testStation.id,
      testJob.id,
      jobItem.id,
      steps[0].id,
    );
    createdSessionIds.push(session.id);

    // Report quantities
    await TestFactory.reportQuantities(
      session.id,
      productionEvent.id,
      50,
      0,
      stoppageStatus.id,
    );

    // Verify the status event captured job_item_id and job_item_step_id
    const { data: event } = await supabase
      .from("status_events")
      .select("job_item_id, job_item_step_id")
      .eq("id", productionEvent.id)
      .single();

    expect(event?.job_item_id).toBe(jobItem.id);
    expect(event?.job_item_step_id).toBe(steps[0].id);
  });

  it("should accumulate WIP across multiple production periods", async () => {
    const supabase = getTestSupabase();

    // Create job item
    const jobItem = await TestFactory.createJobItem(testJob.id, "qty_wip_accum");
    createdJobItemIds.push(jobItem.id);

    const { steps } = await TestFactory.createPipeline(jobItem.id, [testStation.id]);

    // Create production session
    const { session, productionEvent: prod1 } = await TestFactory.createProductionSession(
      testWorker.id,
      testStation.id,
      testJob.id,
      jobItem.id,
      steps[0].id,
    );
    createdSessionIds.push(session.id);

    // First production period: 40 good
    const { newStatusEvent: stopEvent } = await TestFactory.reportQuantities(
      session.id,
      prod1.id,
      40,
      0,
      stoppageStatus.id,
    );

    // Enter production again
    const { data: prod2 } = await supabase.rpc("create_status_event_atomic", {
      p_session_id: session.id,
      p_status_definition_id: productionStatus.id,
    });

    // Second production period: 30 good
    await TestFactory.reportQuantities(
      session.id,
      prod2.id,
      30,
      0,
      stoppageStatus.id,
    );

    // Verify WIP accumulated: 40 + 30 = 70
    const balance = await TestFactory.getWipBalance(jobItem.id, steps[0].id);
    expect(balance?.good_available).toBe(70);

    // Verify progress also accumulated (terminal station)
    const progress = await TestFactory.getJobItemProgress(jobItem.id);
    expect(progress?.completed_good).toBe(70);
  });

  it("should not update WIP for legacy sessions without job item binding", async () => {
    const supabase = getTestSupabase();

    // Create a job item and pipeline (but we won't bind it to the session)
    const jobItem = await TestFactory.createJobItem(testJob.id, "qty_wip_legacy");
    createdJobItemIds.push(jobItem.id);

    const { steps } = await TestFactory.createPipeline(jobItem.id, [testStation.id]);

    // Create legacy session (no job item binding)
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

    // Report quantities (should succeed but not modify WIP)
    const { error } = await supabase.rpc("end_production_status_atomic", {
      p_session_id: session.id,
      p_status_event_id: productionEvent.id,
      p_quantity_good: 100,
      p_quantity_scrap: 10,
      p_next_status_id: stoppageStatus.id,
    });

    expect(error).toBeNull();

    // Verify WIP was NOT modified (should still be 0)
    const balance = await TestFactory.getWipBalance(jobItem.id, steps[0].id);
    expect(balance?.good_available).toBe(0);

    // Verify progress was NOT modified
    const progress = await TestFactory.getJobItemProgress(jobItem.id);
    expect(progress?.completed_good).toBe(0);
  });

  it("should handle scrap correctly - consumed but not accumulated", async () => {
    const supabase = getTestSupabase();

    // Create 2-station pipeline
    const jobItem = await TestFactory.createJobItem(testJob.id, "qty_wip_scrap");
    createdJobItemIds.push(jobItem.id);

    const { steps } = await TestFactory.createPipeline(jobItem.id, [
      testStation.id,
      testStation2.id,
    ]);

    // Create second worker for station 2
    const testWorker2 = await TestFactory.createWorker("qty_wip_scrap_w2");

    // Worker 1 at station 1: produce 100 items
    const { session: s1, productionEvent: p1 } = await TestFactory.createProductionSession(
      testWorker.id,
      testStation.id,
      testJob.id,
      jobItem.id,
      steps[0].id,
    );
    createdSessionIds.push(s1.id);

    await TestFactory.reportQuantities(s1.id, p1.id, 100, 0, stoppageStatus.id);

    // Worker 2 at station 2: 20 good + 15 scrap
    const { session: s2, productionEvent: p2 } = await TestFactory.createProductionSession(
      testWorker2.id,
      testStation2.id,
      testJob.id,
      jobItem.id,
      steps[1].id,
    );
    createdSessionIds.push(s2.id);

    await TestFactory.reportQuantities(s2.id, p2.id, 20, 15, stoppageStatus.id);

    // Verify WIP:
    // Station 1: 100 - 20 (good pull) - 15 (scrap pull) = 65
    // Station 2: 20 (only good accumulates, scrap doesn't)
    const balance1 = await TestFactory.getWipBalance(jobItem.id, steps[0].id);
    const balance2 = await TestFactory.getWipBalance(jobItem.id, steps[1].id);

    expect(balance1?.good_available).toBe(65);
    expect(balance2?.good_available).toBe(20);

    // Cleanup worker2
    await TestCleanup.cleanupWorkers([testWorker2.id]);
  });

  it("should update job_item_progress.completed_good at terminal station", async () => {
    const supabase = getTestSupabase();

    // Create 3-station pipeline
    const jobItem = await TestFactory.createJobItem(testJob.id, "qty_wip_terminal");
    createdJobItemIds.push(jobItem.id);

    const testStation3 = await TestFactory.createStation("qty_wip_s3");
    const { steps } = await TestFactory.createPipeline(jobItem.id, [
      testStation.id,
      testStation2.id,
      testStation3.id,
    ]);

    // Verify is_terminal flags
    expect(steps[0].is_terminal).toBe(false);
    expect(steps[1].is_terminal).toBe(false);
    expect(steps[2].is_terminal).toBe(true);

    // Create workers
    const w2 = await TestFactory.createWorker("qty_wip_term_w2");
    const w3 = await TestFactory.createWorker("qty_wip_term_w3");

    // Station 1: produce 100
    const { session: s1, productionEvent: p1 } = await TestFactory.createProductionSession(
      testWorker.id,
      testStation.id,
      testJob.id,
      jobItem.id,
      steps[0].id,
    );
    createdSessionIds.push(s1.id);
    await TestFactory.reportQuantities(s1.id, p1.id, 100, 0, stoppageStatus.id);

    // Progress should be 0 (station 1 is not terminal)
    let progress = await TestFactory.getJobItemProgress(jobItem.id);
    expect(progress?.completed_good).toBe(0);

    // Station 2: produce 80
    const { session: s2, productionEvent: p2 } = await TestFactory.createProductionSession(
      w2.id,
      testStation2.id,
      testJob.id,
      jobItem.id,
      steps[1].id,
    );
    createdSessionIds.push(s2.id);
    await TestFactory.reportQuantities(s2.id, p2.id, 80, 0, stoppageStatus.id);

    // Progress should still be 0 (station 2 is not terminal)
    progress = await TestFactory.getJobItemProgress(jobItem.id);
    expect(progress?.completed_good).toBe(0);

    // Station 3 (terminal): produce 60
    const { session: s3, productionEvent: p3 } = await TestFactory.createProductionSession(
      w3.id,
      testStation3.id,
      testJob.id,
      jobItem.id,
      steps[2].id,
    );
    createdSessionIds.push(s3.id);
    await TestFactory.reportQuantities(s3.id, p3.id, 60, 0, stoppageStatus.id);

    // Progress should now be 60 (terminal station completed)
    progress = await TestFactory.getJobItemProgress(jobItem.id);
    expect(progress?.completed_good).toBe(60);

    // Cleanup
    await TestCleanup.cleanupStations([testStation3.id]);
    await TestCleanup.cleanupWorkers([w2.id, w3.id]);
  });

  it("should create wip_consumptions records for audit trail", async () => {
    const supabase = getTestSupabase();

    // Create 2-station pipeline
    const jobItem = await TestFactory.createJobItem(testJob.id, "qty_wip_audit");
    createdJobItemIds.push(jobItem.id);

    const { steps } = await TestFactory.createPipeline(jobItem.id, [
      testStation.id,
      testStation2.id,
    ]);

    const w2 = await TestFactory.createWorker("qty_wip_audit_w2");

    // Station 1: produce 50
    const { session: s1, productionEvent: p1 } = await TestFactory.createProductionSession(
      testWorker.id,
      testStation.id,
      testJob.id,
      jobItem.id,
      steps[0].id,
    );
    createdSessionIds.push(s1.id);
    await TestFactory.reportQuantities(s1.id, p1.id, 50, 0, stoppageStatus.id);

    // Station 2: consume 30
    const { session: s2, productionEvent: p2 } = await TestFactory.createProductionSession(
      w2.id,
      testStation2.id,
      testJob.id,
      jobItem.id,
      steps[1].id,
    );
    createdSessionIds.push(s2.id);
    await TestFactory.reportQuantities(s2.id, p2.id, 30, 0, stoppageStatus.id);

    // Verify consumption record was created
    const consumptions = await TestFactory.getWipConsumptions(jobItem.id);
    expect(consumptions).toHaveLength(1);
    expect(consumptions[0].from_job_item_step_id).toBe(steps[0].id);
    expect(consumptions[0].consuming_session_id).toBe(s2.id);
    expect(consumptions[0].good_used).toBe(30);
    expect(consumptions[0].is_scrap).toBe(false);

    // Cleanup
    await TestCleanup.cleanupWorkers([w2.id]);
  });
});
