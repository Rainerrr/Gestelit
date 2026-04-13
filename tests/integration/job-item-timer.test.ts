import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createSession,
  closeActiveSessionsForWorker,
  bindJobItemToSession,
  unbindJobItemFromSession,
  getJobItemAccumulatedTime,
  getGracefulActiveSession,
} from "@/lib/data/sessions";
import { TestFactory, TestCleanup, getTestSupabase } from "../helpers";

/**
 * Per-job-item timer regression tests.
 *
 * These exercise the invariant enforced by migration
 * 20260413100000_split_status_event_on_job_item_change.sql: every status_event
 * row has a constant job_item_id across its full [started_at, ended_at] range,
 * because bind/unbind atomically splits the currently-open event when the
 * effective job_item_id changes. Without the split, time spent after a
 * mid-event swap would be credited to the old job item (or to NULL) instead
 * of the new one.
 */
describe("Per-job-item timer", () => {
  let testWorker: { id: string };
  let testStation: { id: string };
  let testJob: { id: string };
  let jobItemA: { id: string };
  let stepA: { id: string };
  let jobItemB: { id: string };
  let stepB: { id: string };
  let productionStatusId: string;
  let setupStatusId: string;

  const createdSessionIds: string[] = [];
  const createdJobItemIds: string[] = [];
  const createdJobItemStepIds: string[] = [];

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const insertJobItem = async (name: string) => {
    const supabase = getTestSupabase();
    const { data: jobItem, error: jobItemError } = await supabase
      .from("job_items")
      .insert({
        job_id: testJob.id,
        name,
        planned_quantity: 100,
        is_active: true,
      })
      .select("*")
      .single();
    if (jobItemError) throw new Error(`Failed to create job item: ${jobItemError.message}`);
    createdJobItemIds.push(jobItem.id);

    const { data: step, error: stepError } = await supabase
      .from("job_item_steps")
      .insert({
        job_item_id: jobItem.id,
        station_id: testStation.id,
        position: 1,
        is_terminal: true,
      })
      .select("*")
      .single();
    if (stepError) throw new Error(`Failed to create job_item_step: ${stepError.message}`);
    createdJobItemStepIds.push(step.id);

    await supabase.from("wip_balances").insert({
      job_item_id: jobItem.id,
      job_item_step_id: step.id,
      good_reported: 0,
      scrap_reported: 0,
    });

    await supabase.from("job_item_progress").insert({
      job_item_id: jobItem.id,
      completed_good: 0,
    });

    return { jobItem, step };
  };

  /**
   * Open a status event directly via create_status_event_atomic so we don't
   * rely on any API route. This mirrors what the worker UI would do when
   * transitioning to a status.
   */
  const openStatusEvent = async (sessionId: string, statusDefinitionId: string) => {
    const supabase = getTestSupabase();
    const { data, error } = await supabase.rpc("create_status_event_atomic", {
      p_session_id: sessionId,
      p_status_definition_id: statusDefinitionId,
    });
    if (error) throw new Error(`create_status_event_atomic failed: ${error.message}`);
    return data as { id: string; started_at: string };
  };

  beforeAll(async () => {
    const supabase = getTestSupabase();

    testWorker = await TestFactory.createWorker("timer");
    testStation = await TestFactory.createStation("timer");
    testJob = await TestFactory.createJob("timer");

    const a = await insertJobItem("Timer Item A");
    jobItemA = a.jobItem;
    stepA = a.step;

    const b = await insertJobItem("Timer Item B");
    jobItemB = b.jobItem;
    stepB = b.step;

    // Pick a production and a setup status definition.
    const { data: prod } = await supabase
      .from("status_definitions")
      .select("id")
      .eq("machine_state", "production")
      .eq("is_protected", true)
      .limit(1)
      .single();
    if (!prod) throw new Error("No production status definition available");
    productionStatusId = prod.id;

    const { data: setup } = await supabase
      .from("status_definitions")
      .select("id")
      .eq("machine_state", "setup")
      .limit(1)
      .single();
    if (!setup) throw new Error("No setup status definition available");
    setupStatusId = setup.id;
  });

  beforeEach(async () => {
    if (testWorker?.id) {
      const closed = await closeActiveSessionsForWorker(testWorker.id);
      createdSessionIds.push(...closed);
    }
  });

  afterAll(async () => {
    const supabase = getTestSupabase();

    await TestCleanup.cleanupSessions(createdSessionIds);

    if (createdJobItemStepIds.length > 0) {
      await supabase.from("wip_balances").delete().in("job_item_step_id", createdJobItemStepIds);
    }
    if (createdJobItemIds.length > 0) {
      await supabase.from("job_item_progress").delete().in("job_item_id", createdJobItemIds);
    }
    if (createdJobItemStepIds.length > 0) {
      await supabase.from("job_item_steps").delete().in("id", createdJobItemStepIds);
    }
    if (createdJobItemIds.length > 0) {
      await supabase.from("job_items").delete().in("id", createdJobItemIds);
    }

    await TestCleanup.cleanupJobs([testJob.id]);
    await TestCleanup.cleanupStations([testStation.id]);
    await TestCleanup.cleanupWorkers([testWorker.id]);
  });

  it("bind returns newStatusEventId when an open event changes job item", async () => {
    const session = await createSession({
      worker_id: testWorker.id,
      station_id: testStation.id,
      job_id: null,
    });
    createdSessionIds.push(session.id);

    // Worker starts in setup with no job item bound
    await openStatusEvent(session.id, setupStatusId);

    // First bind: open event has job_item_id = NULL, so it's DISTINCT from A
    // and must be split.
    const firstBind = await bindJobItemToSession(
      session.id,
      testJob.id,
      jobItemA.id,
      stepA.id,
    );
    expect(firstBind.newStatusEventId).not.toBeNull();

    // Rebinding the same job item shouldn't split (same job_item_id).
    const sameBind = await bindJobItemToSession(
      session.id,
      testJob.id,
      jobItemA.id,
      stepA.id,
    );
    expect(sameBind.newStatusEventId).toBeNull();

    // Switching to B must split again.
    const swapToB = await bindJobItemToSession(
      session.id,
      testJob.id,
      jobItemB.id,
      stepB.id,
    );
    expect(swapToB.newStatusEventId).not.toBeNull();
  });

  it("swap within a single status credits each item correctly", async () => {
    const session = await createSession({
      worker_id: testWorker.id,
      station_id: testStation.id,
      job_id: null,
    });
    createdSessionIds.push(session.id);

    await openStatusEvent(session.id, setupStatusId);

    await bindJobItemToSession(session.id, testJob.id, jobItemA.id, stepA.id);
    await sleep(2100);

    // Swap to B. This MUST close the A-stamped event and open a B-stamped one.
    await bindJobItemToSession(session.id, testJob.id, jobItemB.id, stepB.id);
    await sleep(2100);

    // Swap back to A.
    await bindJobItemToSession(session.id, testJob.id, jobItemA.id, stepA.id);
    await sleep(2100);

    // Close the current open event by transitioning status, so accumulated
    // time for A (the active job item) gets finalized.
    await openStatusEvent(session.id, productionStatusId);

    const timerA = await getJobItemAccumulatedTime(session.id, jobItemA.id);
    const timerB = await getJobItemAccumulatedTime(session.id, jobItemB.id);

    // Allow generous tolerances — test workers on CI are slow. The key
    // invariants are:
    //   1. Neither item has ~0 or ~6s (which would indicate misattribution)
    //   2. A + B ≈ 6s total wall-clock time spent in setup
    expect(timerA.accumulatedSeconds).toBeGreaterThanOrEqual(3);
    expect(timerA.accumulatedSeconds).toBeLessThan(6);
    expect(timerB.accumulatedSeconds).toBeGreaterThanOrEqual(1);
    expect(timerB.accumulatedSeconds).toBeLessThan(4);

    const totalTracked = timerA.accumulatedSeconds + timerB.accumulatedSeconds;
    expect(totalTracked).toBeGreaterThanOrEqual(5);
    expect(totalTracked).toBeLessThan(9);
  });

  it("pre-bind time belongs to NULL, not the first bound item", async () => {
    const session = await createSession({
      worker_id: testWorker.id,
      station_id: testStation.id,
      job_id: null,
    });
    createdSessionIds.push(session.id);

    // Setup status opens with job_item_id=NULL (no binding yet)
    await openStatusEvent(session.id, setupStatusId);
    await sleep(2100);

    // Now bind A. The pre-bind slice should stay with job_item_id=NULL.
    await bindJobItemToSession(session.id, testJob.id, jobItemA.id, stepA.id);
    await sleep(2100);

    // Close A's event by switching status
    await openStatusEvent(session.id, productionStatusId);

    const timerA = await getJobItemAccumulatedTime(session.id, jobItemA.id);
    // A should see ~2s (its own slice), not ~4s (wall-clock from session start)
    expect(timerA.accumulatedSeconds).toBeGreaterThanOrEqual(1);
    expect(timerA.accumulatedSeconds).toBeLessThan(4);
  });

  it("unbind mid-event stops crediting the old job item", async () => {
    const session = await createSession({
      worker_id: testWorker.id,
      station_id: testStation.id,
      job_id: null,
    });
    createdSessionIds.push(session.id);

    await openStatusEvent(session.id, setupStatusId);
    await bindJobItemToSession(session.id, testJob.id, jobItemA.id, stepA.id);
    await sleep(2100);

    // Unbind — should split the event, leaving A credited only for [0, 2s]
    await unbindJobItemFromSession(session.id);
    await sleep(2100);

    // Close the now-NULL-stamped continuation event
    await openStatusEvent(session.id, productionStatusId);

    const timerA = await getJobItemAccumulatedTime(session.id, jobItemA.id);
    expect(timerA.accumulatedSeconds).toBeGreaterThanOrEqual(1);
    expect(timerA.accumulatedSeconds).toBeLessThan(4);
  });

  it("graceful resume reports accumulated time plus live segment", async () => {
    const session = await createSession({
      worker_id: testWorker.id,
      station_id: testStation.id,
      job_id: null,
    });
    createdSessionIds.push(session.id);

    await openStatusEvent(session.id, setupStatusId);
    await bindJobItemToSession(session.id, testJob.id, jobItemA.id, stepA.id);
    await sleep(2100);

    // Close A's event by swapping statuses — its duration gets credited
    await openStatusEvent(session.id, productionStatusId);
    await sleep(1100);

    const resumed = await getGracefulActiveSession(testWorker.id);
    expect(resumed).not.toBeNull();
    expect(resumed?.activeJobItem?.id).toBe(jobItemA.id);
    expect(resumed?.jobItemAccumulatedSeconds ?? 0).toBeGreaterThanOrEqual(1);
    expect(resumed?.currentJobItemStartedAt).toBeTruthy();
  });
});
