import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TestFactory, TestCleanup, getTestSupabase } from "../helpers";

describe("Pipeline Setup (setup_job_item_pipeline RPC)", () => {
  // Test fixtures
  let testWorker: { id: string };
  let testStation1: { id: string };
  let testStation2: { id: string };
  let testStation3: { id: string };
  let testStation4: { id: string };
  let testJob: { id: string };

  // Track created resources for cleanup
  const createdJobItemIds: string[] = [];
  const createdPresetIds: string[] = [];

  beforeAll(async () => {
    // Create test fixtures
    testWorker = await TestFactory.createWorker("wip_pipeline");
    testStation1 = await TestFactory.createStation("wip_pipe_s1");
    testStation2 = await TestFactory.createStation("wip_pipe_s2");
    testStation3 = await TestFactory.createStation("wip_pipe_s3");
    testStation4 = await TestFactory.createStation("wip_pipe_s4");
    testJob = await TestFactory.createJob("wip_pipeline");
  });

  afterAll(async () => {
    await TestCleanup.cleanupPipelineTest({
      jobItemIds: createdJobItemIds,
      jobIds: [testJob.id],
      presetIds: createdPresetIds,
      stationIds: [testStation1.id, testStation2.id, testStation3.id, testStation4.id],
      workerIds: [testWorker.id],
    });
  });

  it("should create steps from station array with correct positions", async () => {
    const supabase = getTestSupabase();

    // Create job item
    const jobItem = await TestFactory.createJobItem(testJob.id, "pipeline_create");
    createdJobItemIds.push(jobItem.id);

    // Create pipeline with 3 stations
    const stationIds = [testStation1.id, testStation2.id, testStation3.id];
    const { steps } = await TestFactory.createPipeline(jobItem.id, stationIds);

    expect(steps).toHaveLength(3);
    expect(steps[0].position).toBe(1);
    expect(steps[0].station_id).toBe(testStation1.id);
    expect(steps[1].position).toBe(2);
    expect(steps[1].station_id).toBe(testStation2.id);
    expect(steps[2].position).toBe(3);
    expect(steps[2].station_id).toBe(testStation3.id);
  });

  it("should mark only the last station as terminal", async () => {
    const supabase = getTestSupabase();

    // Create job item
    const jobItem = await TestFactory.createJobItem(testJob.id, "pipeline_terminal");
    createdJobItemIds.push(jobItem.id);

    // Create 4-station pipeline
    const stationIds = [testStation1.id, testStation2.id, testStation3.id, testStation4.id];
    const { steps } = await TestFactory.createPipeline(jobItem.id, stationIds);

    expect(steps).toHaveLength(4);
    expect(steps[0].is_terminal).toBe(false);
    expect(steps[1].is_terminal).toBe(false);
    expect(steps[2].is_terminal).toBe(false);
    expect(steps[3].is_terminal).toBe(true);
  });

  it("should create wip_balances for each step", async () => {
    const supabase = getTestSupabase();

    // Create job item
    const jobItem = await TestFactory.createJobItem(testJob.id, "pipeline_wip");
    createdJobItemIds.push(jobItem.id);

    // Create pipeline
    const stationIds = [testStation1.id, testStation2.id];
    const { steps } = await TestFactory.createPipeline(jobItem.id, stationIds);

    // Verify wip_balances were created
    const { data: balances, error } = await supabase
      .from("wip_balances")
      .select("*")
      .eq("job_item_id", jobItem.id);

    expect(error).toBeNull();
    expect(balances).toHaveLength(2);

    // Each balance should have good_available = 0 initially
    for (const balance of balances ?? []) {
      expect(balance.good_available).toBe(0);
    }

    // Verify each step has a corresponding balance
    const stepIds = new Set(steps.map((s) => s.id));
    const balanceStepIds = new Set((balances ?? []).map((b) => b.job_item_step_id));
    expect(stepIds).toEqual(balanceStepIds);
  });

  it("should create job_item_progress row", async () => {
    const supabase = getTestSupabase();

    // Create job item
    const jobItem = await TestFactory.createJobItem(testJob.id, "pipeline_progress");
    createdJobItemIds.push(jobItem.id);

    // Create pipeline
    await TestFactory.createPipeline(jobItem.id, [testStation1.id, testStation2.id]);

    // Verify progress row was created
    const { data: progress, error } = await supabase
      .from("job_item_progress")
      .select("*")
      .eq("job_item_id", jobItem.id)
      .single();

    expect(error).toBeNull();
    expect(progress).toBeDefined();
    expect(progress?.completed_good).toBe(0);
  });

  it("should store pipeline_preset_id when provided", async () => {
    const supabase = getTestSupabase();

    // Create a preset
    const preset = await TestFactory.createPipelinePreset("wip_pipe_preset", [
      testStation1.id,
      testStation2.id,
    ]);
    createdPresetIds.push(preset.id);

    // Create job item
    const jobItem = await TestFactory.createJobItem(testJob.id, "pipeline_preset_ref");
    createdJobItemIds.push(jobItem.id);

    // Create pipeline with preset reference
    await TestFactory.createPipeline(
      jobItem.id,
      [testStation1.id, testStation2.id],
      preset.id,
    );

    // Verify preset_id was stored
    const { data: item, error } = await supabase
      .from("job_items")
      .select("pipeline_preset_id")
      .eq("id", jobItem.id)
      .single();

    expect(error).toBeNull();
    expect(item?.pipeline_preset_id).toBe(preset.id);
  });

  it("should fail for empty station array", async () => {
    const supabase = getTestSupabase();

    // Create job item
    const jobItem = await TestFactory.createJobItem(testJob.id, "pipeline_empty");
    createdJobItemIds.push(jobItem.id);

    // Try to create pipeline with empty array
    const { error } = await supabase.rpc("setup_job_item_pipeline", {
      p_job_item_id: jobItem.id,
      p_station_ids: [],
      p_preset_id: null,
    });

    expect(error).toBeDefined();
    expect(error?.message).toContain("cannot be empty");
  });

  it("should fail for locked pipeline (production started)", async () => {
    const supabase = getTestSupabase();

    // Create job item
    const jobItem = await TestFactory.createJobItem(testJob.id, "pipeline_locked");
    createdJobItemIds.push(jobItem.id);

    // Create initial pipeline
    await TestFactory.createPipeline(jobItem.id, [testStation1.id, testStation2.id]);

    // Lock the pipeline (simulating production started)
    await supabase
      .from("job_items")
      .update({ is_pipeline_locked: true })
      .eq("id", jobItem.id);

    // Try to modify locked pipeline
    const { error } = await supabase.rpc("setup_job_item_pipeline", {
      p_job_item_id: jobItem.id,
      p_station_ids: [testStation3.id],
      p_preset_id: null,
    });

    expect(error).toBeDefined();
    expect(error?.message).toContain("Cannot modify pipeline");
  });

  it("should replace existing steps when pipeline is not locked", async () => {
    const supabase = getTestSupabase();

    // Create job item
    const jobItem = await TestFactory.createJobItem(testJob.id, "pipeline_replace");
    createdJobItemIds.push(jobItem.id);

    // Create initial 2-station pipeline
    const { steps: initialSteps } = await TestFactory.createPipeline(jobItem.id, [
      testStation1.id,
      testStation2.id,
    ]);
    expect(initialSteps).toHaveLength(2);

    // Replace with 3-station pipeline using different stations
    const { steps: newSteps } = await TestFactory.createPipeline(jobItem.id, [
      testStation3.id,
      testStation4.id,
      testStation1.id,
    ]);

    expect(newSteps).toHaveLength(3);
    expect(newSteps[0].station_id).toBe(testStation3.id);
    expect(newSteps[1].station_id).toBe(testStation4.id);
    expect(newSteps[2].station_id).toBe(testStation1.id);
    expect(newSteps[2].is_terminal).toBe(true);

    // Verify old steps were deleted
    const { data: allSteps } = await supabase
      .from("job_item_steps")
      .select("*")
      .eq("job_item_id", jobItem.id);

    expect(allSteps).toHaveLength(3);
  });

  it("should fail for invalid station ID", async () => {
    const supabase = getTestSupabase();

    // Create job item
    const jobItem = await TestFactory.createJobItem(testJob.id, "pipeline_invalid");
    createdJobItemIds.push(jobItem.id);

    // Try to create pipeline with non-existent station
    const fakeStationId = "00000000-0000-0000-0000-000000000000";
    const { error } = await supabase.rpc("setup_job_item_pipeline", {
      p_job_item_id: jobItem.id,
      p_station_ids: [testStation1.id, fakeStationId],
      p_preset_id: null,
    });

    expect(error).toBeDefined();
    expect(error?.message).toContain("invalid or inactive");
  });

  it("should fail for non-existent job item", async () => {
    const supabase = getTestSupabase();

    const fakeJobItemId = "00000000-0000-0000-0000-000000000000";
    const { error } = await supabase.rpc("setup_job_item_pipeline", {
      p_job_item_id: fakeJobItemId,
      p_station_ids: [testStation1.id],
      p_preset_id: null,
    });

    expect(error).toBeDefined();
    expect(error?.message).toContain("not found");
  });

  it("should handle single-station pipeline correctly", async () => {
    const supabase = getTestSupabase();

    // Create job item
    const jobItem = await TestFactory.createJobItem(testJob.id, "pipeline_single");
    createdJobItemIds.push(jobItem.id);

    // Create single-station pipeline
    const { steps } = await TestFactory.createPipeline(jobItem.id, [testStation1.id]);

    expect(steps).toHaveLength(1);
    expect(steps[0].position).toBe(1);
    expect(steps[0].is_terminal).toBe(true); // Single station is both first and terminal
    expect(steps[0].station_id).toBe(testStation1.id);
  });
});
