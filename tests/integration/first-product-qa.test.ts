import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  checkFirstProductQAApproval,
  createFirstProductQARequest,
  stationRequiresFirstProductQA,
} from "@/lib/data/first-product-qa";
import { TestFactory, TestCleanup, getTestSupabase } from "../helpers";

describe("First Product QA Gate", () => {
  // Test fixtures
  let testWorker: { id: string };
  let testStation: { id: string };
  let testStationWithQA: { id: string };
  let testJob: { id: string };
  let testJobItem: { id: string };

  // Track created resources for cleanup
  const createdReportIds: string[] = [];
  const createdJobItemIds: string[] = [];

  beforeAll(async () => {
    const supabase = getTestSupabase();

    // Create test fixtures
    testWorker = await TestFactory.createWorker("qa_gate");
    testStation = await TestFactory.createStation("qa_gate");
    testJob = await TestFactory.createJob("qa_gate");

    // Create a station WITH QA requirement
    const { data: qaStation, error: qaStationError } = await supabase
      .from("stations")
      .insert({
        name: "Test QA Station",
        code: `QA_STATION_${Date.now()}`,
        station_type: "other",
        is_active: true,
        requires_first_product_qa: true,
      })
      .select("*")
      .single();

    if (qaStationError) throw new Error(`Failed to create QA station: ${qaStationError.message}`);
    testStationWithQA = qaStation;

    // Create a job item for the QA station (pipeline-based schema)
    const { data: jobItem, error: jobItemError } = await supabase
      .from("job_items")
      .insert({
        job_id: testJob.id,
        name: "Test QA Product",
        planned_quantity: 100,
        is_active: true,
      })
      .select("*")
      .single();

    if (jobItemError) throw new Error(`Failed to create job item: ${jobItemError.message}`);
    testJobItem = jobItem;
    createdJobItemIds.push(jobItem.id);

    // Create job_item_steps entry for the QA station
    const { error: jisError } = await supabase
      .from("job_item_steps")
      .insert({
        job_item_id: testJobItem.id,
        station_id: testStationWithQA.id,
        position: 1,
        is_terminal: true,
      });

    if (jisError) throw new Error(`Failed to create job_item_step: ${jisError.message}`);

    // Create WIP balance
    const { data: jis } = await supabase
      .from("job_item_steps")
      .select("id")
      .eq("job_item_id", testJobItem.id)
      .single();

    if (jis) {
      await supabase.from("wip_balances").insert({
        job_item_id: testJobItem.id,
        job_item_step_id: jis.id,
        good_available: 0,
      });
    }

    // Create job_item_progress
    await supabase.from("job_item_progress").insert({
      job_item_id: testJobItem.id,
      completed_good: 0,
    });
  });

  // Clean up reports between tests to ensure isolation
  beforeEach(async () => {
    const supabase = getTestSupabase();
    // Delete any existing QA reports for our test job item to ensure test isolation
    if (testJobItem?.id) {
      await supabase
        .from("reports")
        .delete()
        .eq("job_item_id", testJobItem.id)
        .eq("is_first_product_qa", true);
    }
  });

  afterAll(async () => {
    const supabase = getTestSupabase();

    // Cleanup in reverse order
    await TestCleanup.cleanupReports(createdReportIds);

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

  it("should correctly identify station with QA requirement", async () => {
    const requiresQA = await stationRequiresFirstProductQA(testStationWithQA.id);
    expect(requiresQA).toBe(true);

    const noQA = await stationRequiresFirstProductQA(testStation.id);
    expect(noQA).toBe(false);
  });

  it("should return not approved when no QA request exists", async () => {
    const status = await checkFirstProductQAApproval(testJobItem.id, testStationWithQA.id);

    expect(status).toBeDefined();
    expect(status.approved).toBe(false);
    expect(status.pendingReport).toBeFalsy();
    expect(status.approvedReport).toBeFalsy();
  });

  it("should create first product QA request", async () => {
    const report = await createFirstProductQARequest({
      jobItemId: testJobItem.id,
      stationId: testStationWithQA.id,
      workerId: testWorker.id,
      description: "Test QA request for first product",
    });

    createdReportIds.push(report.id);

    expect(report).toBeDefined();
    expect(report.id).toBeDefined();
    expect(report.type).toBe("general");
    expect(report.is_first_product_qa).toBe(true);
    expect(report.job_item_id).toBe(testJobItem.id);
    expect(report.station_id).toBe(testStationWithQA.id);
    expect(report.status).toBe("new");
  });

  it("should return pending status when QA request exists but not approved", async () => {
    // Create a QA request
    const report = await createFirstProductQARequest({
      jobItemId: testJobItem.id,
      stationId: testStationWithQA.id,
      workerId: testWorker.id,
      description: "Pending QA request",
    });
    createdReportIds.push(report.id);

    // Check status
    const status = await checkFirstProductQAApproval(testJobItem.id, testStationWithQA.id);

    expect(status.approved).toBe(false);
    expect(status.pendingReport).toBeDefined();
    expect(status.pendingReport?.id).toBe(report.id);
  });

  it("should return approved status after admin approval", async () => {
    const supabase = getTestSupabase();

    // Create a QA request
    const report = await createFirstProductQARequest({
      jobItemId: testJobItem.id,
      stationId: testStationWithQA.id,
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
    const status = await checkFirstProductQAApproval(testJobItem.id, testStationWithQA.id);

    expect(status.approved).toBe(true);
    expect(status.approvedReport).toBeDefined();
    expect(status.approvedReport?.id).toBe(report.id);
    expect(status.pendingReport).toBeFalsy();
  });

  it("should allow multiple QA requests for different job items", async () => {
    const supabase = getTestSupabase();

    // Create another job item (pipeline-based schema)
    const { data: jobItem2, error: jobItem2Error } = await supabase
      .from("job_items")
      .insert({
        job_id: testJob.id,
        name: "Test QA Product 2",
        planned_quantity: 50,
        is_active: true,
      })
      .select("*")
      .single();

    if (jobItem2Error) throw new Error(`Failed to create second job item: ${jobItem2Error.message}`);
    if (!jobItem2) throw new Error("Failed to create second job item");
    createdJobItemIds.push(jobItem2.id);

    // Create job_item_steps entry for the second job item
    const { error: jis2Error } = await supabase
      .from("job_item_steps")
      .insert({
        job_item_id: jobItem2.id,
        station_id: testStationWithQA.id,
        position: 1,
        is_terminal: true,
      });

    if (jis2Error) throw new Error(`Failed to create job_item_step for job item 2: ${jis2Error.message}`);

    // Create QA requests for both job items
    const report1 = await createFirstProductQARequest({
      jobItemId: testJobItem.id,
      stationId: testStationWithQA.id,
      workerId: testWorker.id,
      description: "QA for job item 1",
    });
    createdReportIds.push(report1.id);

    const report2 = await createFirstProductQARequest({
      jobItemId: jobItem2.id,
      stationId: testStationWithQA.id,
      workerId: testWorker.id,
      description: "QA for job item 2",
    });
    createdReportIds.push(report2.id);

    // Check that each job item has its own QA status
    const status1 = await checkFirstProductQAApproval(testJobItem.id, testStationWithQA.id);
    const status2 = await checkFirstProductQAApproval(jobItem2.id, testStationWithQA.id);

    expect(status1.pendingReport?.id).toBe(report1.id);
    expect(status2.pendingReport?.id).toBe(report2.id);

    // Approve only the first one
    await supabase
      .from("reports")
      .update({ status: "approved" })
      .eq("id", report1.id);

    // Re-check statuses
    const status1After = await checkFirstProductQAApproval(testJobItem.id, testStationWithQA.id);
    const status2After = await checkFirstProductQAApproval(jobItem2.id, testStationWithQA.id);

    expect(status1After.approved).toBe(true);
    expect(status2After.approved).toBe(false);
  });
});
