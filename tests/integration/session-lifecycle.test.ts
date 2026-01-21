import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createSession, startStatusEvent, completeSession, closeActiveSessionsForWorker } from "@/lib/data/sessions";
import { TestFactory, TestCleanup, getTestSupabase } from "../helpers";

describe("Session Lifecycle", () => {
  // Test fixtures
  let testWorker: { id: string };
  let testStation: { id: string };
  let testJob: { id: string };
  let productionStatus: { id: string };
  let stoppageStatus: { id: string };

  // Track created resources for cleanup
  const createdSessionIds: string[] = [];

  beforeAll(async () => {
    // Create test fixtures
    testWorker = await TestFactory.createWorker("session_test");
    testStation = await TestFactory.createStation("session_test");
    testJob = await TestFactory.createJob("session_test");
    productionStatus = await TestFactory.getProductionStatus();
    stoppageStatus = await TestFactory.getStoppageStatus();
  });

  // Close active sessions before each test to ensure isolation
  beforeEach(async () => {
    if (testWorker?.id) {
      const closedIds = await closeActiveSessionsForWorker(testWorker.id);
      createdSessionIds.push(...closedIds);
    }
  });

  afterAll(async () => {
    // Cleanup in reverse order of dependencies
    await TestCleanup.cleanupSessions(createdSessionIds);
    await TestCleanup.cleanupJobs([testJob.id]);
    await TestCleanup.cleanupStations([testStation.id]);
    await TestCleanup.cleanupWorkers([testWorker.id]);
  });

  it("should create a session with initial status set correctly", async () => {
    const session = await createSession({
      worker_id: testWorker.id,
      station_id: testStation.id,
      job_id: testJob.id,
    });

    createdSessionIds.push(session.id);

    expect(session).toBeDefined();
    expect(session.id).toBeDefined();
    expect(session.worker_id).toBe(testWorker.id);
    expect(session.station_id).toBe(testStation.id);
    expect(session.job_id).toBe(testJob.id);
    expect(session.status).toBe("active");
    expect(session.current_status_id).toBeDefined();
    expect(session.started_at).toBeDefined();
  });

  it("should mirror status changes to session.current_status_id", async () => {
    // Create a fresh session
    const session = await createSession({
      worker_id: testWorker.id,
      station_id: testStation.id,
      job_id: testJob.id,
    });
    createdSessionIds.push(session.id);

    const initialStatusId = session.current_status_id;

    // Change status to production
    await startStatusEvent({
      session_id: session.id,
      status_definition_id: productionStatus.id,
    });

    // Verify session was updated
    const supabase = getTestSupabase();
    const { data: updatedSession } = await supabase
      .from("sessions")
      .select("current_status_id, last_status_change_at")
      .eq("id", session.id)
      .single();

    expect(updatedSession?.current_status_id).toBe(productionStatus.id);
    expect(updatedSession?.current_status_id).not.toBe(initialStatusId);
    expect(updatedSession?.last_status_change_at).toBeDefined();
  });

  it("should close previous status event when new one starts", async () => {
    const session = await createSession({
      worker_id: testWorker.id,
      station_id: testStation.id,
      job_id: testJob.id,
    });
    createdSessionIds.push(session.id);

    // Start first status event
    await startStatusEvent({
      session_id: session.id,
      status_definition_id: productionStatus.id,
    });

    // Start second status event
    await startStatusEvent({
      session_id: session.id,
      status_definition_id: stoppageStatus.id,
    });

    // Check that only the latest event is open (no ended_at)
    const supabase = getTestSupabase();
    const { data: events } = await supabase
      .from("status_events")
      .select("*")
      .eq("session_id", session.id)
      .order("started_at", { ascending: true });

    expect(events).toBeDefined();
    expect(events!.length).toBeGreaterThanOrEqual(2);

    // All events except the last should have ended_at set
    const closedEvents = events!.slice(0, -1);
    const openEvent = events![events!.length - 1];

    for (const event of closedEvents) {
      expect(event.ended_at).not.toBeNull();
    }
    expect(openEvent.ended_at).toBeNull();
    expect(openEvent.status_definition_id).toBe(stoppageStatus.id);
  });

  it("should handle concurrent status updates without data corruption", async () => {
    const session = await createSession({
      worker_id: testWorker.id,
      station_id: testStation.id,
      job_id: testJob.id,
    });
    createdSessionIds.push(session.id);

    // Fire multiple concurrent status updates
    const promises = [
      startStatusEvent({
        session_id: session.id,
        status_definition_id: productionStatus.id,
        note: "concurrent-1",
      }),
      startStatusEvent({
        session_id: session.id,
        status_definition_id: stoppageStatus.id,
        note: "concurrent-2",
      }),
      startStatusEvent({
        session_id: session.id,
        status_definition_id: productionStatus.id,
        note: "concurrent-3",
      }),
    ];

    // All should complete without errors
    const results = await Promise.allSettled(promises);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBe(3);

    // Verify only one event is open
    const supabase = getTestSupabase();
    const { data: openEvents } = await supabase
      .from("status_events")
      .select("*")
      .eq("session_id", session.id)
      .is("ended_at", null);

    expect(openEvents).toBeDefined();
    expect(openEvents!.length).toBe(1);

    // Verify session has a valid current_status_id
    const { data: finalSession } = await supabase
      .from("sessions")
      .select("current_status_id")
      .eq("id", session.id)
      .single();

    expect(finalSession?.current_status_id).toBeDefined();
  });

  it("should complete session successfully", async () => {
    const session = await createSession({
      worker_id: testWorker.id,
      station_id: testStation.id,
      job_id: testJob.id,
    });
    createdSessionIds.push(session.id);

    const completedSession = await completeSession(session.id);

    expect(completedSession.status).toBe("completed");
    expect(completedSession.ended_at).toBeDefined();
  });

  it("should store status event with note and metadata", async () => {
    const session = await createSession({
      worker_id: testWorker.id,
      station_id: testStation.id,
      job_id: testJob.id,
    });
    createdSessionIds.push(session.id);

    const testNote = "Test note for status event";
    const event = await startStatusEvent({
      session_id: session.id,
      status_definition_id: stoppageStatus.id,
      note: testNote,
      station_reason_id: "general-malfunction",
    });

    expect(event.note).toBe(testNote);
    expect(event.station_reason_id).toBe("general-malfunction");
  });
});
