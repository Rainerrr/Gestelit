import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { closeActiveSessionsForWorker } from "@/lib/data/sessions";
import { TestFactory, TestCleanup, getTestSupabase } from "../helpers";

describe("WIP Multi-Station Flow (update_session_quantities_atomic_v4)", () => {
  // Test fixtures
  let testWorker1: { id: string };
  let testWorker2: { id: string };
  let testWorker3: { id: string };
  let testStationA: { id: string };
  let testStationB: { id: string };
  let testStationC: { id: string };
  let testJob: { id: string };
  let productionStatus: { id: string };
  let stoppageStatus: { id: string };

  // Track created resources for cleanup
  const createdSessionIds: string[] = [];
  const createdJobItemIds: string[] = [];

  beforeAll(async () => {
    // Create test fixtures
    testWorker1 = await TestFactory.createWorker("wip_multi_w1");
    testWorker2 = await TestFactory.createWorker("wip_multi_w2");
    testWorker3 = await TestFactory.createWorker("wip_multi_w3");
    testStationA = await TestFactory.createStation("wip_multi_a");
    testStationB = await TestFactory.createStation("wip_multi_b");
    testStationC = await TestFactory.createStation("wip_multi_c");
    testJob = await TestFactory.createJob("wip_multi");
    productionStatus = await TestFactory.getProductionStatus();
    stoppageStatus = await TestFactory.getStoppageStatus();
  });

  beforeEach(async () => {
    // Close active sessions before each test
    for (const worker of [testWorker1, testWorker2, testWorker3]) {
      if (worker?.id) {
        const closedIds = await closeActiveSessionsForWorker(worker.id);
        createdSessionIds.push(...closedIds);
      }
    }
  });

  afterAll(async () => {
    await TestCleanup.cleanupPipelineTest({
      sessionIds: createdSessionIds,
      jobItemIds: createdJobItemIds,
      jobIds: [testJob.id],
      stationIds: [testStationA.id, testStationB.id, testStationC.id],
      workerIds: [testWorker1.id, testWorker2.id, testWorker3.id],
    });
  });

  describe("First Station - Origination", () => {
    it("should add all GOOD products as new inventory (origination)", async () => {
      const supabase = getTestSupabase();

      // Create job item with 3-station pipeline
      const jobItem = await TestFactory.createJobItem(testJob.id, "wip_first");
      createdJobItemIds.push(jobItem.id);

      const { steps } = await TestFactory.createPipeline(jobItem.id, [
        testStationA.id,
        testStationB.id,
        testStationC.id,
      ]);

      // Create session at first station (position 1)
      const { session, productionEvent } = await TestFactory.createProductionSession(
        testWorker1.id,
        testStationA.id,
        testJob.id,
        jobItem.id,
        steps[0].id,
      );
      createdSessionIds.push(session.id);

      // Report 50 good products
      await TestFactory.reportQuantities(
        session.id,
        productionEvent.id,
        50,
        0,
        stoppageStatus.id,
      );

      // Verify WIP balance at station A
      const balanceA = await TestFactory.getWipBalance(jobItem.id, steps[0].id);
      expect(balanceA?.good_available).toBe(50);

      // Verify NO wip_consumptions (nothing to consume at first station)
      const consumptions = await TestFactory.getWipConsumptions(jobItem.id);
      expect(consumptions).toHaveLength(0);
    });

    it("should handle multiple production periods at first station", async () => {
      const supabase = getTestSupabase();

      // Create job item
      const jobItem = await TestFactory.createJobItem(testJob.id, "wip_first_multi");
      createdJobItemIds.push(jobItem.id);

      const { steps } = await TestFactory.createPipeline(jobItem.id, [
        testStationA.id,
        testStationB.id,
      ]);

      // Create session
      const { session, productionEvent: prod1 } = await TestFactory.createProductionSession(
        testWorker1.id,
        testStationA.id,
        testJob.id,
        jobItem.id,
        steps[0].id,
      );
      createdSessionIds.push(session.id);

      // First production period: 30 good
      const { newStatusEvent: stopEvent1 } = await TestFactory.reportQuantities(
        session.id,
        prod1.id,
        30,
        0,
        stoppageStatus.id,
      );

      // Second production period: 20 good
      const { data: prod2 } = await supabase.rpc("create_status_event_atomic", {
        p_session_id: session.id,
        p_status_definition_id: productionStatus.id,
      });

      await TestFactory.reportQuantities(
        session.id,
        prod2.id,
        20,
        0,
        stoppageStatus.id,
      );

      // Verify WIP balance accumulated: 30 + 20 = 50
      const balanceA = await TestFactory.getWipBalance(jobItem.id, steps[0].id);
      expect(balanceA?.good_available).toBe(50);
    });
  });

  describe("Middle Station - Full Pull", () => {
    it("should consume from upstream when sufficient WIP available", async () => {
      const supabase = getTestSupabase();

      // Create job item with 3-station pipeline
      const jobItem = await TestFactory.createJobItem(testJob.id, "wip_middle_full");
      createdJobItemIds.push(jobItem.id);

      const { steps } = await TestFactory.createPipeline(jobItem.id, [
        testStationA.id,
        testStationB.id,
        testStationC.id,
      ]);

      // Worker 1 at station A: produce 100 items
      const { session: sessionA, productionEvent: prodA } = await TestFactory.createProductionSession(
        testWorker1.id,
        testStationA.id,
        testJob.id,
        jobItem.id,
        steps[0].id,
      );
      createdSessionIds.push(sessionA.id);

      await TestFactory.reportQuantities(sessionA.id, prodA.id, 100, 0, stoppageStatus.id);

      // Verify station A has 100
      const balanceA_before = await TestFactory.getWipBalance(jobItem.id, steps[0].id);
      expect(balanceA_before?.good_available).toBe(100);

      // Worker 2 at station B: process 30 items
      const { session: sessionB, productionEvent: prodB } = await TestFactory.createProductionSession(
        testWorker2.id,
        testStationB.id,
        testJob.id,
        jobItem.id,
        steps[1].id,
      );
      createdSessionIds.push(sessionB.id);

      await TestFactory.reportQuantities(sessionB.id, prodB.id, 30, 0, stoppageStatus.id);

      // Verify:
      // - Station A: 100 - 30 = 70
      // - Station B: +30
      const balanceA = await TestFactory.getWipBalance(jobItem.id, steps[0].id);
      const balanceB = await TestFactory.getWipBalance(jobItem.id, steps[1].id);

      expect(balanceA?.good_available).toBe(70);
      expect(balanceB?.good_available).toBe(30);

      // Verify consumption record was created
      const consumptions = await TestFactory.getWipConsumptions(jobItem.id);
      expect(consumptions).toHaveLength(1);
      expect(consumptions[0].from_job_item_step_id).toBe(steps[0].id);
      expect(consumptions[0].good_used).toBe(30);
      expect(consumptions[0].is_scrap).toBe(false);
    });
  });

  describe("Middle Station - Partial Pull", () => {
    it("should handle partial pull when upstream has insufficient WIP", async () => {
      const supabase = getTestSupabase();

      // Create job item
      const jobItem = await TestFactory.createJobItem(testJob.id, "wip_partial");
      createdJobItemIds.push(jobItem.id);

      const { steps } = await TestFactory.createPipeline(jobItem.id, [
        testStationA.id,
        testStationB.id,
        testStationC.id,
      ]);

      // Worker 1 at station A: produce only 10 items
      const { session: sessionA, productionEvent: prodA } = await TestFactory.createProductionSession(
        testWorker1.id,
        testStationA.id,
        testJob.id,
        jobItem.id,
        steps[0].id,
      );
      createdSessionIds.push(sessionA.id);

      await TestFactory.reportQuantities(sessionA.id, prodA.id, 10, 0, stoppageStatus.id);

      // Worker 2 at station B: try to report 50 items (only 10 available upstream)
      const { session: sessionB, productionEvent: prodB } = await TestFactory.createProductionSession(
        testWorker2.id,
        testStationB.id,
        testJob.id,
        jobItem.id,
        steps[1].id,
      );
      createdSessionIds.push(sessionB.id);

      await TestFactory.reportQuantities(sessionB.id, prodB.id, 50, 0, stoppageStatus.id);

      // Verify:
      // - Station A: 10 - 10 = 0 (all consumed)
      // - Station B: +50 (10 consumed + 40 originated)
      const balanceA = await TestFactory.getWipBalance(jobItem.id, steps[0].id);
      const balanceB = await TestFactory.getWipBalance(jobItem.id, steps[1].id);

      expect(balanceA?.good_available).toBe(0);
      expect(balanceB?.good_available).toBe(50);

      // Verify consumption was only for what was available (10)
      const consumptions = await TestFactory.getWipConsumptions(jobItem.id);
      expect(consumptions).toHaveLength(1);
      expect(consumptions[0].good_used).toBe(10);
    });

    it("should originate all if upstream is empty", async () => {
      const supabase = getTestSupabase();

      // Create job item (no production at station A)
      const jobItem = await TestFactory.createJobItem(testJob.id, "wip_originate");
      createdJobItemIds.push(jobItem.id);

      const { steps } = await TestFactory.createPipeline(jobItem.id, [
        testStationA.id,
        testStationB.id,
      ]);

      // Worker directly at station B (nothing at A)
      const { session: sessionB, productionEvent: prodB } = await TestFactory.createProductionSession(
        testWorker1.id,
        testStationB.id,
        testJob.id,
        jobItem.id,
        steps[1].id,
      );
      createdSessionIds.push(sessionB.id);

      await TestFactory.reportQuantities(sessionB.id, prodB.id, 25, 0, stoppageStatus.id);

      // Station B should have 25 (all originated)
      const balanceB = await TestFactory.getWipBalance(jobItem.id, steps[1].id);
      expect(balanceB?.good_available).toBe(25);

      // No consumptions (nothing was consumed)
      const consumptions = await TestFactory.getWipConsumptions(jobItem.id);
      expect(consumptions).toHaveLength(0);
    });
  });

  describe("Terminal Station", () => {
    it("should increment job_item_progress.completed_good at terminal", async () => {
      const supabase = getTestSupabase();

      // Create job item
      const jobItem = await TestFactory.createJobItem(testJob.id, "wip_terminal");
      createdJobItemIds.push(jobItem.id);

      const { steps } = await TestFactory.createPipeline(jobItem.id, [
        testStationA.id,
        testStationB.id,
        testStationC.id, // Terminal
      ]);

      // Worker 1 at A: 100 items
      const { session: sessionA, productionEvent: prodA } = await TestFactory.createProductionSession(
        testWorker1.id,
        testStationA.id,
        testJob.id,
        jobItem.id,
        steps[0].id,
      );
      createdSessionIds.push(sessionA.id);
      await TestFactory.reportQuantities(sessionA.id, prodA.id, 100, 0, stoppageStatus.id);

      // Worker 2 at B: 50 items
      const { session: sessionB, productionEvent: prodB } = await TestFactory.createProductionSession(
        testWorker2.id,
        testStationB.id,
        testJob.id,
        jobItem.id,
        steps[1].id,
      );
      createdSessionIds.push(sessionB.id);
      await TestFactory.reportQuantities(sessionB.id, prodB.id, 50, 0, stoppageStatus.id);

      // Worker 3 at C (terminal): 25 items
      const { session: sessionC, productionEvent: prodC } = await TestFactory.createProductionSession(
        testWorker3.id,
        testStationC.id,
        testJob.id,
        jobItem.id,
        steps[2].id,
      );
      createdSessionIds.push(sessionC.id);
      await TestFactory.reportQuantities(sessionC.id, prodC.id, 25, 0, stoppageStatus.id);

      // Verify job_item_progress.completed_good = 25
      const progress = await TestFactory.getJobItemProgress(jobItem.id);
      expect(progress?.completed_good).toBe(25);

      // Verify WIP balances
      const balanceA = await TestFactory.getWipBalance(jobItem.id, steps[0].id);
      const balanceB = await TestFactory.getWipBalance(jobItem.id, steps[1].id);
      const balanceC = await TestFactory.getWipBalance(jobItem.id, steps[2].id);

      expect(balanceA?.good_available).toBe(50); // 100 - 50
      expect(balanceB?.good_available).toBe(25); // 50 - 25
      expect(balanceC?.good_available).toBe(25); // Terminal also has WIP balance
    });
  });

  describe("Scrap Reporting", () => {
    it("should consume from upstream but NOT accumulate scrap at current step", async () => {
      const supabase = getTestSupabase();

      // Create job item
      const jobItem = await TestFactory.createJobItem(testJob.id, "wip_scrap");
      createdJobItemIds.push(jobItem.id);

      const { steps } = await TestFactory.createPipeline(jobItem.id, [
        testStationA.id,
        testStationB.id,
      ]);

      // Worker 1 at A: 50 good items
      const { session: sessionA, productionEvent: prodA } = await TestFactory.createProductionSession(
        testWorker1.id,
        testStationA.id,
        testJob.id,
        jobItem.id,
        steps[0].id,
      );
      createdSessionIds.push(sessionA.id);
      await TestFactory.reportQuantities(sessionA.id, prodA.id, 50, 0, stoppageStatus.id);

      // Worker 2 at B: 20 scrap (consumes from A but doesn't add to B)
      const { session: sessionB, productionEvent: prodB } = await TestFactory.createProductionSession(
        testWorker2.id,
        testStationB.id,
        testJob.id,
        jobItem.id,
        steps[1].id,
      );
      createdSessionIds.push(sessionB.id);
      await TestFactory.reportQuantities(sessionB.id, prodB.id, 0, 20, stoppageStatus.id);

      // Verify:
      // - Station A: 50 - 20 = 30 (consumed by scrap)
      // - Station B: 0 (scrap doesn't accumulate)
      const balanceA = await TestFactory.getWipBalance(jobItem.id, steps[0].id);
      const balanceB = await TestFactory.getWipBalance(jobItem.id, steps[1].id);

      expect(balanceA?.good_available).toBe(30);
      expect(balanceB?.good_available).toBe(0);

      // Verify consumption marked as scrap
      const consumptions = await TestFactory.getWipConsumptions(jobItem.id);
      expect(consumptions).toHaveLength(1);
      expect(consumptions[0].good_used).toBe(20);
      expect(consumptions[0].is_scrap).toBe(true);
    });

    it("should handle mixed good and scrap in same report", async () => {
      const supabase = getTestSupabase();

      // Create job item
      const jobItem = await TestFactory.createJobItem(testJob.id, "wip_mixed");
      createdJobItemIds.push(jobItem.id);

      const { steps } = await TestFactory.createPipeline(jobItem.id, [
        testStationA.id,
        testStationB.id,
      ]);

      // Worker 1 at A: 100 items
      const { session: sessionA, productionEvent: prodA } = await TestFactory.createProductionSession(
        testWorker1.id,
        testStationA.id,
        testJob.id,
        jobItem.id,
        steps[0].id,
      );
      createdSessionIds.push(sessionA.id);
      await TestFactory.reportQuantities(sessionA.id, prodA.id, 100, 0, stoppageStatus.id);

      // Worker 2 at B: 30 good + 10 scrap = 40 total consumed
      const { session: sessionB, productionEvent: prodB } = await TestFactory.createProductionSession(
        testWorker2.id,
        testStationB.id,
        testJob.id,
        jobItem.id,
        steps[1].id,
      );
      createdSessionIds.push(sessionB.id);
      await TestFactory.reportQuantities(sessionB.id, prodB.id, 30, 10, stoppageStatus.id);

      // Verify:
      // - Station A: 100 - 30 (good) - 10 (scrap) = 60
      // - Station B: 30 (only good accumulates)
      const balanceA = await TestFactory.getWipBalance(jobItem.id, steps[0].id);
      const balanceB = await TestFactory.getWipBalance(jobItem.id, steps[1].id);

      expect(balanceA?.good_available).toBe(60);
      expect(balanceB?.good_available).toBe(30);

      // Verify both consumptions recorded
      const consumptions = await TestFactory.getWipConsumptions(jobItem.id);
      expect(consumptions).toHaveLength(2);

      const goodConsumption = consumptions.find((c) => !c.is_scrap);
      const scrapConsumption = consumptions.find((c) => c.is_scrap);

      expect(goodConsumption?.good_used).toBe(30);
      expect(scrapConsumption?.good_used).toBe(10);
    });
  });

  describe("Error Cases", () => {
    it("should return SESSION_NOT_FOUND for non-existent session", async () => {
      const supabase = getTestSupabase();

      const fakeSessionId = "00000000-0000-0000-0000-000000000000";
      const { data, error } = await supabase.rpc("update_session_quantities_atomic_v4", {
        p_session_id: fakeSessionId,
        p_delta_good: 10,
        p_delta_scrap: 0,
      });

      expect(data.success).toBe(false);
      expect(data.error_code).toBe("SESSION_NOT_FOUND");
    });

    it("should return JOB_ITEM_STEP_NOT_FOUND for invalid step", async () => {
      const supabase = getTestSupabase();

      // Create session without proper step reference
      const jobItem = await TestFactory.createJobItem(testJob.id, "wip_step_err");
      createdJobItemIds.push(jobItem.id);

      const { steps } = await TestFactory.createPipeline(jobItem.id, [testStationA.id]);

      // Create a session manually with invalid step reference
      const { data: session } = await supabase
        .from("sessions")
        .insert({
          worker_id: testWorker1.id,
          station_id: testStationA.id,
          job_id: testJob.id,
          job_item_id: jobItem.id,
          job_item_step_id: "00000000-0000-0000-0000-000000000000", // Invalid step
          status: "active",
        })
        .select("id")
        .single();

      if (session) {
        createdSessionIds.push(session.id);

        const { data } = await supabase.rpc("update_session_quantities_atomic_v4", {
          p_session_id: session.id,
          p_delta_good: 10,
          p_delta_scrap: 0,
        });

        expect(data.success).toBe(false);
        expect(data.error_code).toBe("JOB_ITEM_STEP_NOT_FOUND");
      }
    });

    it("should succeed for legacy session without job_item_id", async () => {
      const supabase = getTestSupabase();

      // Create session without job_item binding
      const { data: session } = await supabase
        .from("sessions")
        .insert({
          worker_id: testWorker1.id,
          station_id: testStationA.id,
          job_id: testJob.id,
          status: "active",
        })
        .select("id")
        .single();

      if (session) {
        createdSessionIds.push(session.id);

        const { data, error } = await supabase.rpc("update_session_quantities_atomic_v4", {
          p_session_id: session.id,
          p_delta_good: 10,
          p_delta_scrap: 5,
        });

        expect(error).toBeNull();
        expect(data.success).toBe(true);
        // No WIP modifications for legacy sessions
      }
    });
  });

  describe("Concurrent Updates", () => {
    it("should handle concurrent WIP updates via advisory lock", async () => {
      const supabase = getTestSupabase();

      // Create job item
      const jobItem = await TestFactory.createJobItem(testJob.id, "wip_concurrent");
      createdJobItemIds.push(jobItem.id);

      const { steps } = await TestFactory.createPipeline(jobItem.id, [
        testStationA.id,
        testStationB.id,
      ]);

      // Pre-seed station A with 100 items
      const { session: sessionA, productionEvent: prodA } = await TestFactory.createProductionSession(
        testWorker1.id,
        testStationA.id,
        testJob.id,
        jobItem.id,
        steps[0].id,
      );
      createdSessionIds.push(sessionA.id);
      await TestFactory.reportQuantities(sessionA.id, prodA.id, 100, 0, stoppageStatus.id);

      // Create two sessions at B that will report concurrently
      const { session: sessionB1, productionEvent: prodB1 } = await TestFactory.createProductionSession(
        testWorker2.id,
        testStationB.id,
        testJob.id,
        jobItem.id,
        steps[1].id,
      );
      createdSessionIds.push(sessionB1.id);

      const { session: sessionB2, productionEvent: prodB2 } = await TestFactory.createProductionSession(
        testWorker3.id,
        testStationB.id,
        testJob.id,
        jobItem.id,
        steps[1].id,
      );
      createdSessionIds.push(sessionB2.id);

      // Fire concurrent reports (each trying to consume 30)
      const results = await Promise.allSettled([
        TestFactory.reportQuantities(sessionB1.id, prodB1.id, 30, 0, stoppageStatus.id),
        TestFactory.reportQuantities(sessionB2.id, prodB2.id, 30, 0, stoppageStatus.id),
      ]);

      // Both should succeed (advisory lock serializes them)
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled.length).toBe(2);

      // Verify WIP is consistent
      const balanceA = await TestFactory.getWipBalance(jobItem.id, steps[0].id);
      const balanceB = await TestFactory.getWipBalance(jobItem.id, steps[1].id);

      // A: 100 - 30 - 30 = 40
      // B: 30 + 30 = 60
      expect(balanceA?.good_available).toBe(40);
      expect(balanceB?.good_available).toBe(60);
    });
  });
});
