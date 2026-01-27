import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  checkFirstProductApprovalForSession,
  createFirstProductApprovalRequest,
  stepRequiresFirstProductApproval,
} from "@/lib/data/first-product-qa";
import { createSession, closeActiveSessionsForWorker } from "@/lib/data/sessions";
import { TestFactory, TestCleanup, getTestSupabase } from "../helpers";

describe("First Product QA Gate", () => {
  // Test fixtures
  let testWorker: { id: string };
  let testStation: { id: string };
  let testStationWithQA: { id: string };
  let testJob: { id: string };
  let testJobItem: { id: string };
  let testJobItemStepId: string;
  let testJobItemStepWithQAId: string;

  // Track created resources for cleanup
  const createdReportIds: string[] = [];
  const createdJobItemIds: string[] = [];
  const createdSessionIds: string[] = [];

  beforeAll(async () => {
    const supabase = getTestSupabase();

    // Create test fixtures
    testWorker = await TestFactory.createWorker("qa_gate");
    testStation = await TestFactory.createStation("qa_gate");
    testJob = await TestFactory.createJob("qa_gate");

    // Create a station for QA tests (QA requirement is on job_item_steps, not stations)
    const { data: qaStation, error: qaStationError } = await supabase
      .from("stations")
      .insert({
        name: "Test QA Station",
        code: `QA_STATION_${Date.now()}`,
        station_type: "other",
        is_active: true,
      })
      .select("*")
      .single();

    if (qaStationError) throw new Error(`Failed to create QA station: ${qaStationError.message}`);
    testStationWithQA = qaStation;

    // Create a job item for the regular station (no QA requirement)
    const { data: jobItem, error: jobItemError } = await supabase
      .from("job_items")
      .insert({
        job_id: testJob.id,
        name: "Test Product No QA",
        planned_quantity: 100,
        is_active: true,
      })
      .select("*")
      .single();

    if (jobItemError) throw new Error(`Failed to create job item: ${jobItemError.message}`);
    testJobItem = jobItem;
    createdJobItemIds.push(jobItem.id);

    // Create job_item_steps entry for the regular station (no QA)
    const { data: jis, error: jisError } = await supabase
      .from("job_item_steps")
      .insert({
        job_item_id: testJobItem.id,
        station_id: testStation.id,
        position: 1,
        is_terminal: true,
        requires_first_product_approval: false,
      })
      .select("id")
      .single();

    if (jisError) throw new Error(`Failed to create job_item_step: ${jisError.message}`);
    testJobItemStepId = jis.id;

    // Create WIP balance for regular step
    await supabase.from("wip_balances").insert({
      job_item_id: testJobItem.id,
      job_item_step_id: jis.id,
      good_available: 0,
    });

    // Create job_item_progress
    await supabase.from("job_item_progress").insert({
      job_item_id: testJobItem.id,
      completed_good: 0,
    });

    // Create a second job item for the QA station
    const { data: jobItem2, error: jobItem2Error } = await supabase
      .from("job_items")
      .insert({
        job_id: testJob.id,
        name: "Test QA Product",
        planned_quantity: 100,
        is_active: true,
      })
      .select("*")
      .single();

    if (jobItem2Error) throw new Error(`Failed to create second job item: ${jobItem2Error.message}`);
    createdJobItemIds.push(jobItem2.id);

    // Create job_item_steps entry for the QA station WITH requires_first_product_approval
    const { data: jisQA, error: jisQAError } = await supabase
      .from("job_item_steps")
      .insert({
        job_item_id: jobItem2.id,
        station_id: testStationWithQA.id,
        position: 1,
        is_terminal: true,
        requires_first_product_approval: true,
      })
      .select("id")
      .single();

    if (jisQAError) throw new Error(`Failed to create QA job_item_step: ${jisQAError.message}`);
    testJobItemStepWithQAId = jisQA.id;

    // Create WIP balance for QA step
    await supabase.from("wip_balances").insert({
      job_item_id: jobItem2.id,
      job_item_step_id: jisQA.id,
      good_available: 0,
    });

    // Create job_item_progress for second item
    await supabase.from("job_item_progress").insert({
      job_item_id: jobItem2.id,
      completed_good: 0,
    });
  });

  // Clean up reports and sessions between tests to ensure isolation
  beforeEach(async () => {
    const supabase = getTestSupabase();

    // Close any active sessions for the test worker
    if (testWorker?.id) {
      await closeActiveSessionsForWorker(testWorker.id);
    }

    // Delete any existing QA reports to ensure test isolation
    for (const jobItemId of createdJobItemIds) {
      await supabase
        .from("reports")
        .delete()
        .eq("job_item_id", jobItemId)
        .eq("is_first_product_qa", true);
    }
  });

  afterAll(async () => {
    const supabase = getTestSupabase();

    // Cleanup in reverse order
    await TestCleanup.cleanupReports(createdReportIds);
    await TestCleanup.cleanupSessions(createdSessionIds);

    // Cleanup job items
    if (createdJobItemIds.length > 0) {
      await supabase.from("job_items").delete().in("id", createdJobItemIds);
    }

    await TestCleanup.cleanupJobs([testJob.id]);

    // Cleanup QA station
    if (testStationWithQA?.id) {
      await supabase.from("stations").delete().eq("id", testStationWithQA.id);
    }

    await TestCleanup.cleanupStations([testStation.id]);
    await TestCleanup.cleanupWorkers([testWorker.id]);
  });

  it("should correctly identify step with QA requirement", async () => {
    const requiresQA = await stepRequiresFirstProductApproval(testJobItemStepWithQAId);
    expect(requiresQA).toBe(true);

    const noQA = await stepRequiresFirstProductApproval(testJobItemStepId);
    expect(noQA).toBe(false);
  });

  it("should return not_required when step doesn't need QA", async () => {
    // Create a session for testing
    const session = await createSession({
      worker_id: testWorker.id,
      station_id: testStation.id,
      job_id: testJob.id,
      job_item_id: testJobItem.id,
      job_item_step_id: testJobItemStepId,
    });
    createdSessionIds.push(session.id);

    const status = await checkFirstProductApprovalForSession(session.id, testJobItemStepId);

    expect(status).toBeDefined();
    expect(status.required).toBe(false);
    expect(status.status).toBe("not_required");
    expect(status.pendingReport).toBeNull();
    expect(status.approvedReport).toBeNull();
  });

  it("should return needs_submission when QA required but no request exists", async () => {
    const supabase = getTestSupabase();

    // Get the job item for the QA step
    const { data: step } = await supabase
      .from("job_item_steps")
      .select("job_item_id")
      .eq("id", testJobItemStepWithQAId)
      .single();

    // Create a session for testing
    const session = await createSession({
      worker_id: testWorker.id,
      station_id: testStationWithQA.id,
      job_id: testJob.id,
      job_item_id: step!.job_item_id,
      job_item_step_id: testJobItemStepWithQAId,
    });
    createdSessionIds.push(session.id);

    const status = await checkFirstProductApprovalForSession(session.id, testJobItemStepWithQAId);

    expect(status).toBeDefined();
    expect(status.required).toBe(true);
    expect(status.status).toBe("needs_submission");
    expect(status.pendingReport).toBeNull();
    expect(status.approvedReport).toBeNull();
  });

  it("should create first product QA request", async () => {
    const supabase = getTestSupabase();

    // Get the job item for the QA step
    const { data: step } = await supabase
      .from("job_item_steps")
      .select("job_item_id")
      .eq("id", testJobItemStepWithQAId)
      .single();

    // Create a session for testing
    const session = await createSession({
      worker_id: testWorker.id,
      station_id: testStationWithQA.id,
      job_id: testJob.id,
      job_item_id: step!.job_item_id,
      job_item_step_id: testJobItemStepWithQAId,
    });
    createdSessionIds.push(session.id);

    const report = await createFirstProductApprovalRequest({
      sessionId: session.id,
      jobItemStepId: testJobItemStepWithQAId,
      workerId: testWorker.id,
      description: "Test QA request for first product",
    });

    createdReportIds.push(report.id);

    expect(report).toBeDefined();
    expect(report.id).toBeDefined();
    expect(report.type).toBe("general");
    expect(report.is_first_product_qa).toBe(true);
    expect(report.job_item_id).toBe(step!.job_item_id);
    expect(report.station_id).toBe(testStationWithQA.id);
    expect(report.status).toBe("new");
  });

  it("should return pending status when QA request exists but not approved", async () => {
    const supabase = getTestSupabase();

    // Get the job item for the QA step
    const { data: step } = await supabase
      .from("job_item_steps")
      .select("job_item_id")
      .eq("id", testJobItemStepWithQAId)
      .single();

    // Create a session for testing
    const session = await createSession({
      worker_id: testWorker.id,
      station_id: testStationWithQA.id,
      job_id: testJob.id,
      job_item_id: step!.job_item_id,
      job_item_step_id: testJobItemStepWithQAId,
    });
    createdSessionIds.push(session.id);

    // Create a QA request
    const report = await createFirstProductApprovalRequest({
      sessionId: session.id,
      jobItemStepId: testJobItemStepWithQAId,
      workerId: testWorker.id,
      description: "Pending QA request",
    });
    createdReportIds.push(report.id);

    // Check status
    const status = await checkFirstProductApprovalForSession(session.id, testJobItemStepWithQAId);

    expect(status.required).toBe(true);
    expect(status.status).toBe("pending");
    expect(status.pendingReport).toBeDefined();
    expect(status.pendingReport?.id).toBe(report.id);
  });

  it("should return approved status after admin approval", async () => {
    const supabase = getTestSupabase();

    // Get the job item for the QA step
    const { data: step } = await supabase
      .from("job_item_steps")
      .select("job_item_id")
      .eq("id", testJobItemStepWithQAId)
      .single();

    // Create a session for testing
    const session = await createSession({
      worker_id: testWorker.id,
      station_id: testStationWithQA.id,
      job_id: testJob.id,
      job_item_id: step!.job_item_id,
      job_item_step_id: testJobItemStepWithQAId,
    });
    createdSessionIds.push(session.id);

    // Create a QA request
    const report = await createFirstProductApprovalRequest({
      sessionId: session.id,
      jobItemStepId: testJobItemStepWithQAId,
      workerId: testWorker.id,
      description: "QA request to approve",
    });
    createdReportIds.push(report.id);

    // Admin approves the request
    const { error: approveError } = await supabase
      .from("reports")
      .update({
        status: "approved",
        status_changed_at: new Date().toISOString(),
        status_changed_by: "test-admin",
      })
      .eq("id", report.id);

    if (approveError) throw new Error(`Failed to approve report: ${approveError.message}`);

    // Check status
    const status = await checkFirstProductApprovalForSession(session.id, testJobItemStepWithQAId);

    expect(status.required).toBe(true);
    expect(status.status).toBe("approved");
    expect(status.approvedReport).toBeDefined();
    expect(status.approvedReport?.id).toBe(report.id);
    expect(status.pendingReport).toBeNull();
  });
});
