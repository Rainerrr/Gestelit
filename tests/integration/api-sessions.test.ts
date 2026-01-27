import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createSession, closeActiveSessionsForWorker } from "@/lib/data/sessions";
import { TestFactory, TestCleanup, getTestSupabase } from "../helpers";

/**
 * Integration tests for session-related API endpoints
 *
 * POST /api/sessions/bind-job-item
 * GET /api/sessions/:id/totals
 *
 * IMPORTANT: These tests require the development server to be running!
 * Start the server with: npm run dev
 * Then run tests with: npm run test -- tests/integration/api-sessions.test.ts
 */

const BASE_URL = "http://localhost:3000";

// Check if the server is available
async function isServerRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/api/health`, { method: "GET" });
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

let serverAvailable = false;

describe("Session API Endpoints", () => {
  // Test fixtures
  let testWorker1: { id: string; worker_code: string };
  let testWorker2: { id: string; worker_code: string };
  let testStation: { id: string };
  let testStation2: { id: string };
  let testJob: { id: string };
  let testJob2: { id: string };
  let productionStatus: { id: string };

  // Track created resources for cleanup
  const createdSessionIds: string[] = [];
  const createdJobItemIds: string[] = [];

  beforeAll(async () => {
    // Check if server is running
    serverAvailable = await isServerRunning();
    if (!serverAvailable) {
      console.warn(
        "\n  Development server not running! Start with: npm run dev\n" +
        "   Skipping API tests that require HTTP requests.\n"
      );
      return;
    }

    const supabase = getTestSupabase();

    // Create test fixtures
    const worker1Data = await TestFactory.createWorker("api_sess_w1");
    const { data: w1 } = await supabase
      .from("workers")
      .select("id, worker_code")
      .eq("id", worker1Data.id)
      .single();
    testWorker1 = w1 as { id: string; worker_code: string };

    const worker2Data = await TestFactory.createWorker("api_sess_w2");
    const { data: w2 } = await supabase
      .from("workers")
      .select("id, worker_code")
      .eq("id", worker2Data.id)
      .single();
    testWorker2 = w2 as { id: string; worker_code: string };

    testStation = await TestFactory.createStation("api_sess_s1");
    testStation2 = await TestFactory.createStation("api_sess_s2");
    testJob = await TestFactory.createJob("api_sess_j1");
    testJob2 = await TestFactory.createJob("api_sess_j2");
    productionStatus = await TestFactory.getProductionStatus();
  });

  beforeEach(async () => {
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
      jobIds: [testJob.id, testJob2.id],
      stationIds: [testStation.id, testStation2.id],
      workerIds: [testWorker1.id, testWorker2.id],
    });
  });

  describe("POST /api/sessions/bind-job-item", () => {
    async function makeBindRequest(
      payload: unknown,
      workerCode?: string,
    ): Promise<{ status: number; body: unknown }> {
      if (!serverAvailable) {
        throw new Error(
          "Development server not running!\n" +
          "  Start with: npm run dev\n" +
          "  Then run: npm run test -- tests/integration/api-sessions.test.ts"
        );
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (workerCode) {
        headers["X-Worker-Code"] = workerCode;
      }

      const response = await fetch(`${BASE_URL}/api/sessions/bind-job-item`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => null);
      return { status: response.status, body };
    }

    describe("Valid Requests", () => {
      it("should bind job item to session", async () => {
        // Create job item with pipeline
        const jobItem = await TestFactory.createJobItem(testJob.id, "bind_valid");
        createdJobItemIds.push(jobItem.id);

        const { steps } = await TestFactory.createPipeline(jobItem.id, [testStation.id]);

        // Create session (without job item binding)
        const session = await createSession({
          worker_id: testWorker1.id,
          station_id: testStation.id,
          job_id: testJob.id,
        });
        createdSessionIds.push(session.id);

        // Make bind request
        const { status, body } = await makeBindRequest(
          {
            sessionId: session.id,
            jobId: testJob.id,
            jobItemId: jobItem.id,
            jobItemStepId: steps[0].id,
          },
          testWorker1.worker_code,
        );

        expect(status).toBe(200);
        expect((body as { session: { job_item_id: string } }).session).toBeDefined();
        expect((body as { session: { job_item_id: string } }).session.job_item_id).toBe(jobItem.id);

        // Verify session was updated in database
        const supabase = getTestSupabase();
        const { data: updatedSession } = await supabase
          .from("sessions")
          .select("job_item_id, job_item_step_id")
          .eq("id", session.id)
          .single();

        expect(updatedSession?.job_item_id).toBe(jobItem.id);
        expect(updatedSession?.job_item_step_id).toBe(steps[0].id);
      });

      it("should support deprecated jobItemStationId parameter", async () => {
        const jobItem = await TestFactory.createJobItem(testJob.id, "bind_deprecated");
        createdJobItemIds.push(jobItem.id);

        const { steps } = await TestFactory.createPipeline(jobItem.id, [testStation.id]);

        const session = await createSession({
          worker_id: testWorker1.id,
          station_id: testStation.id,
          job_id: testJob.id,
        });
        createdSessionIds.push(session.id);

        // Use deprecated parameter name
        const { status, body } = await makeBindRequest(
          {
            sessionId: session.id,
            jobId: testJob.id,
            jobItemId: jobItem.id,
            jobItemStationId: steps[0].id, // Deprecated name
          },
          testWorker1.worker_code,
        );

        expect(status).toBe(200);
        expect((body as { session: { job_item_id: string } }).session.job_item_id).toBe(jobItem.id);
      });
    });

    describe("Missing Required Fields", () => {
      it("should return 400 for missing sessionId", async () => {
        const { status, body } = await makeBindRequest(
          {
            jobId: testJob.id,
            jobItemId: "123",
            jobItemStepId: "456",
          },
          testWorker1.worker_code,
        );

        expect(status).toBe(400);
        expect((body as { error: string }).error).toBe("SESSION_ID_REQUIRED");
      });

      it("should return 400 for missing jobId", async () => {
        const { status, body } = await makeBindRequest(
          {
            sessionId: "123",
            jobItemId: "456",
            jobItemStepId: "789",
          },
          testWorker1.worker_code,
        );

        expect(status).toBe(400);
        expect((body as { error: string }).error).toBe("JOB_ID_REQUIRED");
      });

      it("should return 400 for missing jobItemId", async () => {
        const { status, body } = await makeBindRequest(
          {
            sessionId: "123",
            jobId: testJob.id,
            jobItemStepId: "789",
          },
          testWorker1.worker_code,
        );

        expect(status).toBe(400);
        expect((body as { error: string }).error).toBe("JOB_ITEM_ID_REQUIRED");
      });

      it("should return 400 for missing jobItemStepId", async () => {
        const { status, body } = await makeBindRequest(
          {
            sessionId: "123",
            jobId: testJob.id,
            jobItemId: "456",
          },
          testWorker1.worker_code,
        );

        expect(status).toBe(400);
        expect((body as { error: string }).error).toBe("JOB_ITEM_STEP_ID_REQUIRED");
      });
    });

    describe("Authentication", () => {
      it("should return 401/403 without auth header", async () => {
        const { status } = await makeBindRequest({
          sessionId: "123",
          jobId: testJob.id,
          jobItemId: "456",
          jobItemStepId: "789",
        });

        expect([401, 403]).toContain(status);
      });

      it("should return 401/403 for invalid worker code", async () => {
        const { status } = await makeBindRequest(
          {
            sessionId: "123",
            jobId: testJob.id,
            jobItemId: "456",
            jobItemStepId: "789",
          },
          "invalid_worker_code_12345",
        );

        expect([401, 403]).toContain(status);
      });
    });

    describe("Validation Errors", () => {
      it("should return error for non-existent job item", async () => {
        const session = await createSession({
          worker_id: testWorker1.id,
          station_id: testStation.id,
          job_id: testJob.id,
        });
        createdSessionIds.push(session.id);

        const fakeJobItemId = "00000000-0000-0000-0000-000000000000";
        const fakeStepId = "00000000-0000-0000-0000-000000000001";

        const { status, body } = await makeBindRequest(
          {
            sessionId: session.id,
            jobId: testJob.id,
            jobItemId: fakeJobItemId,
            jobItemStepId: fakeStepId,
          },
          testWorker1.worker_code,
        );

        expect(status).toBe(500); // createErrorResponse wraps as 500
        expect((body as { error: string; message: string }).message).toContain("JOB_ITEM_NOT_FOUND");
      });

      it("should return error when job item belongs to different job", async () => {
        // Create job item for job2
        const jobItem = await TestFactory.createJobItem(testJob2.id, "bind_wrong_job");
        createdJobItemIds.push(jobItem.id);

        const { steps } = await TestFactory.createPipeline(jobItem.id, [testStation.id]);

        // Create session for job1
        const session = await createSession({
          worker_id: testWorker1.id,
          station_id: testStation.id,
          job_id: testJob.id,
        });
        createdSessionIds.push(session.id);

        // Try to bind job2's item to job1's session
        const { status, body } = await makeBindRequest(
          {
            sessionId: session.id,
            jobId: testJob.id, // Session's job
            jobItemId: jobItem.id, // Belongs to job2!
            jobItemStepId: steps[0].id,
          },
          testWorker1.worker_code,
        );

        expect(status).toBe(500);
        expect((body as { error: string; message: string }).message).toContain("JOB_ITEM_JOB_MISMATCH");
      });

      it("should return error for inactive job item", async () => {
        const supabase = getTestSupabase();

        // Create job item
        const jobItem = await TestFactory.createJobItem(testJob.id, "bind_inactive");
        createdJobItemIds.push(jobItem.id);

        const { steps } = await TestFactory.createPipeline(jobItem.id, [testStation.id]);

        // Deactivate the job item
        await supabase
          .from("job_items")
          .update({ is_active: false })
          .eq("id", jobItem.id);

        const session = await createSession({
          worker_id: testWorker1.id,
          station_id: testStation.id,
          job_id: testJob.id,
        });
        createdSessionIds.push(session.id);

        const { status, body } = await makeBindRequest(
          {
            sessionId: session.id,
            jobId: testJob.id,
            jobItemId: jobItem.id,
            jobItemStepId: steps[0].id,
          },
          testWorker1.worker_code,
        );

        expect(status).toBe(500);
        expect((body as { error: string; message: string }).message).toContain("JOB_ITEM_INACTIVE");
      });

      it("should return error for non-existent job item step", async () => {
        const jobItem = await TestFactory.createJobItem(testJob.id, "bind_no_step");
        createdJobItemIds.push(jobItem.id);

        await TestFactory.createPipeline(jobItem.id, [testStation.id]);

        const session = await createSession({
          worker_id: testWorker1.id,
          station_id: testStation.id,
          job_id: testJob.id,
        });
        createdSessionIds.push(session.id);

        const fakeStepId = "00000000-0000-0000-0000-000000000000";

        const { status, body } = await makeBindRequest(
          {
            sessionId: session.id,
            jobId: testJob.id,
            jobItemId: jobItem.id,
            jobItemStepId: fakeStepId,
          },
          testWorker1.worker_code,
        );

        expect(status).toBe(500);
        expect((body as { error: string; message: string }).message).toContain("JOB_ITEM_STATION_NOT_FOUND");
      });

      it("should return error when step belongs to different job item", async () => {
        // Create two job items
        const jobItem1 = await TestFactory.createJobItem(testJob.id, "bind_step_mismatch1");
        const jobItem2 = await TestFactory.createJobItem(testJob.id, "bind_step_mismatch2");
        createdJobItemIds.push(jobItem1.id, jobItem2.id);

        const { steps: steps1 } = await TestFactory.createPipeline(jobItem1.id, [testStation.id]);
        await TestFactory.createPipeline(jobItem2.id, [testStation2.id]);

        const session = await createSession({
          worker_id: testWorker1.id,
          station_id: testStation.id,
          job_id: testJob.id,
        });
        createdSessionIds.push(session.id);

        // Try to bind jobItem2 with jobItem1's step
        const { status, body } = await makeBindRequest(
          {
            sessionId: session.id,
            jobId: testJob.id,
            jobItemId: jobItem2.id,
            jobItemStepId: steps1[0].id, // This step belongs to jobItem1!
          },
          testWorker1.worker_code,
        );

        expect(status).toBe(500);
        expect((body as { error: string; message: string }).message).toContain("JOB_ITEM_STATION_MISMATCH");
      });
    });
  });

  describe("GET /api/sessions/:id/totals", () => {
    async function getTotals(
      sessionId: string,
      workerCode?: string,
    ): Promise<{ status: number; body: unknown }> {
      if (!serverAvailable) {
        throw new Error(
          "Development server not running!\n" +
          "  Start with: npm run dev\n" +
          "  Then run: npm run test -- tests/integration/api-sessions.test.ts"
        );
      }

      const headers: Record<string, string> = {};

      if (workerCode) {
        headers["X-Worker-Code"] = workerCode;
      }

      const response = await fetch(`${BASE_URL}/api/sessions/${sessionId}/totals`, {
        method: "GET",
        headers,
      });

      const body = await response.json().catch(() => null);
      return { status: response.status, body };
    }

    it("should return session totals for active session", async () => {
      const stoppageStatus = await TestFactory.getStoppageStatus();

      // Create job item with pipeline
      const jobItem = await TestFactory.createJobItem(testJob.id, "totals_valid");
      createdJobItemIds.push(jobItem.id);

      const { steps } = await TestFactory.createPipeline(jobItem.id, [testStation.id]);

      // Create session and report some quantities
      const { session, productionEvent } = await TestFactory.createProductionSession(
        testWorker1.id,
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
        5,
        stoppageStatus.id,
      );

      // Get totals
      const { status, body } = await getTotals(session.id, testWorker1.worker_code);

      expect(status).toBe(200);

      const totals = body as { good: number; scrap: number };
      expect(totals.good).toBe(50);
      expect(totals.scrap).toBe(5);
    });

    it("should return 404 for non-existent session", async () => {
      const fakeSessionId = "00000000-0000-0000-0000-000000000000";

      const { status, body } = await getTotals(fakeSessionId, testWorker1.worker_code);

      expect(status).toBe(404);
    });
  });
});
