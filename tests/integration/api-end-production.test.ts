import { describe, it, expect, beforeAll, afterAll, beforeEach, test } from "vitest";
import { closeActiveSessionsForWorker } from "@/lib/data/sessions";
import { TestFactory, TestCleanup, getTestSupabase } from "../helpers";

/**
 * Integration tests for POST /api/status-events/end-production
 *
 * These tests make actual HTTP requests to the API endpoint
 * and verify the behavior of the end_production_status_atomic RPC.
 *
 * IMPORTANT: These tests require the development server to be running!
 * Start the server with: npm run dev
 * Then run tests with: npm run test -- tests/integration/api-end-production.test.ts
 */

const BASE_URL = "http://localhost:3000";

// Check if the server is available
async function isServerRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/api/health`, { method: "GET" });
    return response.ok || response.status === 404; // 404 means server is running but no health endpoint
  } catch {
    return false;
  }
}

let serverAvailable = false;

describe("POST /api/status-events/end-production", () => {
  // Test fixtures
  let testWorker1: { id: string; worker_code: string };
  let testWorker2: { id: string; worker_code: string };
  let testStation: { id: string };
  let testJob: { id: string };
  let productionStatus: { id: string };
  let stoppageStatus: { id: string };

  // Track created resources for cleanup
  const createdSessionIds: string[] = [];
  const createdJobItemIds: string[] = [];

  beforeAll(async () => {
    // Check if server is running
    serverAvailable = await isServerRunning();
    if (!serverAvailable) {
      console.warn(
        "\n⚠️  Development server not running! Start with: npm run dev\n" +
        "   Skipping API tests that require HTTP requests.\n"
      );
      return;
    }

    const supabase = getTestSupabase();

    // Create test fixtures
    const worker1Data = await TestFactory.createWorker("api_end_prod_w1");
    const { data: w1 } = await supabase
      .from("workers")
      .select("id, worker_code")
      .eq("id", worker1Data.id)
      .single();
    testWorker1 = w1 as { id: string; worker_code: string };

    const worker2Data = await TestFactory.createWorker("api_end_prod_w2");
    const { data: w2 } = await supabase
      .from("workers")
      .select("id, worker_code")
      .eq("id", worker2Data.id)
      .single();
    testWorker2 = w2 as { id: string; worker_code: string };

    testStation = await TestFactory.createStation("api_end_prod");
    testJob = await TestFactory.createJob("api_end_prod");
    productionStatus = await TestFactory.getProductionStatus();
    stoppageStatus = await TestFactory.getStoppageStatus();
  });

  beforeEach(async () => {
    // Skip if server not running
    if (!serverAvailable) return;

    // Close active sessions before each test
    for (const worker of [testWorker1, testWorker2]) {
      if (worker?.id) {
        const closedIds = await closeActiveSessionsForWorker(worker.id);
        createdSessionIds.push(...closedIds);
      }
    }
  });

  afterAll(async () => {
    if (!serverAvailable) return;

    await TestCleanup.cleanupPipelineTest({
      sessionIds: createdSessionIds,
      jobItemIds: createdJobItemIds,
      jobIds: [testJob.id],
      stationIds: [testStation.id],
      workerIds: [testWorker1.id, testWorker2.id],
    });
  });

  async function makeRequest(
    payload: unknown,
    workerCode?: string,
  ): Promise<{ status: number; body: unknown }> {
    if (!serverAvailable) {
      throw new Error(
        "Development server not running!\n" +
        "  Start with: npm run dev\n" +
        "  Then run: npm run test -- tests/integration/api-end-production.test.ts"
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (workerCode) {
      headers["X-Worker-Code"] = workerCode;
    }

    const response = await fetch(`${BASE_URL}/api/status-events/end-production`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => null);
    return { status: response.status, body };
  }

  describe("Valid Requests", () => {
    it("should end production and return new status event", async () => {
      // Create job item with pipeline
      const jobItem = await TestFactory.createJobItem(testJob.id, "api_valid");
      createdJobItemIds.push(jobItem.id);

      const { steps } = await TestFactory.createPipeline(jobItem.id, [testStation.id]);

      // Create production session
      const { session, productionEvent } = await TestFactory.createProductionSession(
        testWorker1.id,
        testStation.id,
        testJob.id,
        jobItem.id,
        steps[0].id,
      );
      createdSessionIds.push(session.id);

      // Make API request
      const { status, body } = await makeRequest(
        {
          sessionId: session.id,
          statusEventId: productionEvent.id,
          quantityGood: 50,
          quantityScrap: 5,
          nextStatusId: stoppageStatus.id,
        },
        testWorker1.worker_code,
      );

      expect(status).toBe(200);
      expect((body as { success: boolean }).success).toBe(true);
      expect((body as { newStatusEvent: { newStatusEvent: { id: string } } }).newStatusEvent).toBeDefined();

      // Verify the production event was updated
      const supabase = getTestSupabase();
      const { data: event } = await supabase
        .from("status_events")
        .select("quantity_good, quantity_scrap, ended_at")
        .eq("id", productionEvent.id)
        .single();

      expect(event?.quantity_good).toBe(50);
      expect(event?.quantity_scrap).toBe(5);
      expect(event?.ended_at).toBeDefined();

      // Verify WIP was updated
      const balance = await TestFactory.getWipBalance(jobItem.id, steps[0].id);
      expect(balance?.good_available).toBe(50);
    });

    it("should update WIP balances for multi-station pipeline", async () => {
      const supabase = getTestSupabase();

      // Create second station
      const testStation2 = await TestFactory.createStation("api_multi_s2");

      // Create job item with 2-station pipeline
      const jobItem = await TestFactory.createJobItem(testJob.id, "api_multi");
      createdJobItemIds.push(jobItem.id);

      const { steps } = await TestFactory.createPipeline(jobItem.id, [
        testStation.id,
        testStation2.id,
      ]);

      // Worker 1 at station 1: produce 100
      const { session: s1, productionEvent: p1 } = await TestFactory.createProductionSession(
        testWorker1.id,
        testStation.id,
        testJob.id,
        jobItem.id,
        steps[0].id,
      );
      createdSessionIds.push(s1.id);

      await makeRequest(
        {
          sessionId: s1.id,
          statusEventId: p1.id,
          quantityGood: 100,
          quantityScrap: 0,
          nextStatusId: stoppageStatus.id,
        },
        testWorker1.worker_code,
      );

      // Worker 2 at station 2: consume 30
      const { session: s2, productionEvent: p2 } = await TestFactory.createProductionSession(
        testWorker2.id,
        testStation2.id,
        testJob.id,
        jobItem.id,
        steps[1].id,
      );
      createdSessionIds.push(s2.id);

      await makeRequest(
        {
          sessionId: s2.id,
          statusEventId: p2.id,
          quantityGood: 30,
          quantityScrap: 0,
          nextStatusId: stoppageStatus.id,
        },
        testWorker2.worker_code,
      );

      // Verify WIP
      const balance1 = await TestFactory.getWipBalance(jobItem.id, steps[0].id);
      const balance2 = await TestFactory.getWipBalance(jobItem.id, steps[1].id);

      expect(balance1?.good_available).toBe(70); // 100 - 30
      expect(balance2?.good_available).toBe(30);

      // Cleanup extra station
      await TestCleanup.cleanupStations([testStation2.id]);
    });
  });

  describe("Invalid Payloads", () => {
    it("should return 400 for missing sessionId", async () => {
      const { status, body } = await makeRequest(
        {
          statusEventId: "123",
          quantityGood: 10,
          quantityScrap: 0,
          nextStatusId: stoppageStatus.id,
        },
        testWorker1.worker_code,
      );

      expect(status).toBe(400);
      expect((body as { error: string }).error).toBe("INVALID_PAYLOAD");
    });

    it("should return 400 for missing statusEventId", async () => {
      const { status, body } = await makeRequest(
        {
          sessionId: "123",
          quantityGood: 10,
          quantityScrap: 0,
          nextStatusId: stoppageStatus.id,
        },
        testWorker1.worker_code,
      );

      expect(status).toBe(400);
      expect((body as { error: string }).error).toBe("INVALID_PAYLOAD");
    });

    it("should return 400 for missing quantities", async () => {
      const { status, body } = await makeRequest(
        {
          sessionId: "123",
          statusEventId: "456",
          nextStatusId: stoppageStatus.id,
        },
        testWorker1.worker_code,
      );

      expect(status).toBe(400);
      expect((body as { error: string }).error).toBe("INVALID_PAYLOAD");
    });

    it("should return 400 for negative quantityGood", async () => {
      const { status, body } = await makeRequest(
        {
          sessionId: "123",
          statusEventId: "456",
          quantityGood: -5,
          quantityScrap: 0,
          nextStatusId: stoppageStatus.id,
        },
        testWorker1.worker_code,
      );

      expect(status).toBe(400);
      expect((body as { error: string }).error).toBe("INVALID_QUANTITIES");
    });

    it("should return 400 for negative quantityScrap", async () => {
      const { status, body } = await makeRequest(
        {
          sessionId: "123",
          statusEventId: "456",
          quantityGood: 10,
          quantityScrap: -3,
          nextStatusId: stoppageStatus.id,
        },
        testWorker1.worker_code,
      );

      expect(status).toBe(400);
      expect((body as { error: string }).error).toBe("INVALID_QUANTITIES");
    });
  });

  describe("Authentication", () => {
    it("should return 401/403 without auth header", async () => {
      const { status } = await makeRequest({
        sessionId: "123",
        statusEventId: "456",
        quantityGood: 10,
        quantityScrap: 0,
        nextStatusId: stoppageStatus.id,
      });

      // Either 401 or 403 depending on implementation
      expect([401, 403]).toContain(status);
    });

    it("should return 403 when worker doesn't own session", async () => {
      // Create session owned by worker 1
      const jobItem = await TestFactory.createJobItem(testJob.id, "api_owner");
      createdJobItemIds.push(jobItem.id);

      const { steps } = await TestFactory.createPipeline(jobItem.id, [testStation.id]);

      const { session, productionEvent } = await TestFactory.createProductionSession(
        testWorker1.id,
        testStation.id,
        testJob.id,
        jobItem.id,
        steps[0].id,
      );
      createdSessionIds.push(session.id);

      // Worker 2 tries to end production on worker 1's session
      const { status, body } = await makeRequest(
        {
          sessionId: session.id,
          statusEventId: productionEvent.id,
          quantityGood: 10,
          quantityScrap: 0,
          nextStatusId: stoppageStatus.id,
        },
        testWorker2.worker_code,
      );

      expect(status).toBe(403);
    });
  });

  describe("Error Handling", () => {
    it("should return 404 for non-existent session", async () => {
      const fakeSessionId = "00000000-0000-0000-0000-000000000000";

      const { status, body } = await makeRequest(
        {
          sessionId: fakeSessionId,
          statusEventId: "00000000-0000-0000-0000-000000000001",
          quantityGood: 10,
          quantityScrap: 0,
          nextStatusId: stoppageStatus.id,
        },
        testWorker1.worker_code,
      );

      // Will likely fail at auth check first
      expect([403, 404]).toContain(status);
    });

    it("should return 404 for non-existent status event", async () => {
      // Create a real session
      const jobItem = await TestFactory.createJobItem(testJob.id, "api_event_404");
      createdJobItemIds.push(jobItem.id);

      const { steps } = await TestFactory.createPipeline(jobItem.id, [testStation.id]);

      const { session } = await TestFactory.createProductionSession(
        testWorker1.id,
        testStation.id,
        testJob.id,
        jobItem.id,
        steps[0].id,
      );
      createdSessionIds.push(session.id);

      const fakeEventId = "00000000-0000-0000-0000-000000000000";

      const { status, body } = await makeRequest(
        {
          sessionId: session.id,
          statusEventId: fakeEventId,
          quantityGood: 10,
          quantityScrap: 0,
          nextStatusId: stoppageStatus.id,
        },
        testWorker1.worker_code,
      );

      expect(status).toBe(404);
      expect((body as { error: string }).error).toBe("STATUS_EVENT_NOT_FOUND");
    });

    it("should return 400 for session/event mismatch", async () => {
      // Create two sessions with different workers
      const jobItem = await TestFactory.createJobItem(testJob.id, "api_mismatch");
      createdJobItemIds.push(jobItem.id);

      const { steps } = await TestFactory.createPipeline(jobItem.id, [testStation.id]);

      const { session: s1, productionEvent: p1 } = await TestFactory.createProductionSession(
        testWorker1.id,
        testStation.id,
        testJob.id,
        jobItem.id,
        steps[0].id,
      );
      createdSessionIds.push(s1.id);

      const { session: s2, productionEvent: p2 } = await TestFactory.createProductionSession(
        testWorker2.id,
        testStation.id,
        testJob.id,
        jobItem.id,
        steps[0].id,
      );
      createdSessionIds.push(s2.id);

      // Try to end s1's event with s2's session ID
      const { status, body } = await makeRequest(
        {
          sessionId: s2.id,
          statusEventId: p1.id, // This event belongs to s1!
          quantityGood: 10,
          quantityScrap: 0,
          nextStatusId: stoppageStatus.id,
        },
        testWorker2.worker_code,
      );

      expect(status).toBe(400);
      expect((body as { error: string }).error).toBe("STATUS_EVENT_SESSION_MISMATCH");
    });

    it("should return 400 for already-ended status event", async () => {
      const jobItem = await TestFactory.createJobItem(testJob.id, "api_already");
      createdJobItemIds.push(jobItem.id);

      const { steps } = await TestFactory.createPipeline(jobItem.id, [testStation.id]);

      const { session, productionEvent } = await TestFactory.createProductionSession(
        testWorker1.id,
        testStation.id,
        testJob.id,
        jobItem.id,
        steps[0].id,
      );
      createdSessionIds.push(session.id);

      // End production first time
      const { status: status1 } = await makeRequest(
        {
          sessionId: session.id,
          statusEventId: productionEvent.id,
          quantityGood: 10,
          quantityScrap: 0,
          nextStatusId: stoppageStatus.id,
        },
        testWorker1.worker_code,
      );
      expect(status1).toBe(200);

      // Try to end the same event again
      const { status: status2, body } = await makeRequest(
        {
          sessionId: session.id,
          statusEventId: productionEvent.id,
          quantityGood: 20,
          quantityScrap: 0,
          nextStatusId: stoppageStatus.id,
        },
        testWorker1.worker_code,
      );

      expect(status2).toBe(400);
      expect((body as { error: string }).error).toBe("STATUS_EVENT_ALREADY_ENDED");
    });
  });

  describe("Zero Quantities", () => {
    it("should accept zero quantities", async () => {
      const jobItem = await TestFactory.createJobItem(testJob.id, "api_zero");
      createdJobItemIds.push(jobItem.id);

      const { steps } = await TestFactory.createPipeline(jobItem.id, [testStation.id]);

      const { session, productionEvent } = await TestFactory.createProductionSession(
        testWorker1.id,
        testStation.id,
        testJob.id,
        jobItem.id,
        steps[0].id,
      );
      createdSessionIds.push(session.id);

      const { status, body } = await makeRequest(
        {
          sessionId: session.id,
          statusEventId: productionEvent.id,
          quantityGood: 0,
          quantityScrap: 0,
          nextStatusId: stoppageStatus.id,
        },
        testWorker1.worker_code,
      );

      expect(status).toBe(200);
      expect((body as { success: boolean }).success).toBe(true);
    });
  });
});
