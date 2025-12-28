import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createStatusDefinition,
  updateStatusDefinition,
  deleteStatusDefinition,
  fetchActiveStatusDefinitions,
} from "@/lib/data/status-definitions";
import { TestFactory, TestCleanup, getTestSupabase } from "../helpers";
import { testId } from "../setup";

describe("Status Definitions", () => {
  // Test fixtures
  let testStation: { id: string };

  // Track created resources for cleanup
  const createdStatusIds: string[] = [];

  beforeAll(async () => {
    testStation = await TestFactory.createStation("status_test");
  });

  afterAll(async () => {
    await TestCleanup.cleanupStatusDefinitions(createdStatusIds);
    await TestCleanup.cleanupStations([testStation.id]);
  });

  describe("Protected Status Rules", () => {
    it("should prevent editing protected statuses", async () => {
      // Get a protected status (production, malfunction, or other)
      const supabase = getTestSupabase();
      const { data: protectedStatus } = await supabase
        .from("status_definitions")
        .select("*")
        .eq("is_protected", true)
        .limit(1)
        .single();

      expect(protectedStatus).toBeDefined();

      // Attempt to update should throw
      await expect(
        updateStatusDefinition(protectedStatus!.id, {
          label_he: "Modified Label",
        })
      ).rejects.toThrow("STATUS_EDIT_FORBIDDEN_PROTECTED");
    });

    it("should prevent deleting protected statuses", async () => {
      const supabase = getTestSupabase();
      const { data: protectedStatus } = await supabase
        .from("status_definitions")
        .select("*")
        .eq("is_protected", true)
        .limit(1)
        .single();

      expect(protectedStatus).toBeDefined();

      await expect(
        deleteStatusDefinition(protectedStatus!.id)
      ).rejects.toThrow("STATUS_DELETE_FORBIDDEN_PROTECTED");
    });

    it("should prevent creating station-scoped protected status labels", async () => {
      // Protected labels (אחר, ייצור, תקלה) cannot be station-scoped
      await expect(
        createStatusDefinition({
          scope: "station",
          station_id: testStation.id,
          label_he: "ייצור", // Protected label
          color_hex: "#10b981",
          machine_state: "production",
        })
      ).rejects.toThrow("STATUS_PROTECTED_GLOBAL_ONLY");
    });
  });

  describe("Status Creation and Validation", () => {
    it("should create a global status definition", async () => {
      const labelHe = testId("global_status");
      const status = await createStatusDefinition({
        scope: "global",
        label_he: labelHe,
        label_ru: "Test Status RU",
        color_hex: "#3b82f6",
        machine_state: "setup",
      });

      createdStatusIds.push(status.id);

      expect(status.id).toBeDefined();
      expect(status.scope).toBe("global");
      expect(status.label_he).toBe(labelHe);
      expect(status.color_hex).toBe("#3b82f6");
      expect(status.machine_state).toBe("setup");
      expect(status.station_id).toBeNull();
    });

    it("should create a station-scoped status definition", async () => {
      const labelHe = testId("station_status");
      const status = await createStatusDefinition({
        scope: "station",
        station_id: testStation.id,
        label_he: labelHe,
        color_hex: "#ef4444",
        machine_state: "stoppage",
      });

      createdStatusIds.push(status.id);

      expect(status.scope).toBe("station");
      expect(status.station_id).toBe(testStation.id);
    });

    it("should reject invalid color hex values", async () => {
      await expect(
        createStatusDefinition({
          scope: "global",
          label_he: testId("invalid_color"),
          color_hex: "#123456", // Not in allowed palette
          machine_state: "production",
        })
      ).rejects.toThrow("STATUS_COLOR_INVALID_NOT_ALLOWED");
    });

    it("should reject empty Hebrew label", async () => {
      await expect(
        createStatusDefinition({
          scope: "global",
          label_he: "   ", // Empty after trim
          color_hex: "#10b981",
          machine_state: "production",
        })
      ).rejects.toThrow("STATUS_LABEL_HE_REQUIRED");
    });

    it("should require station_id for station-scoped status", async () => {
      await expect(
        createStatusDefinition({
          scope: "station",
          // Missing station_id
          label_he: testId("missing_station"),
          color_hex: "#10b981",
          machine_state: "production",
        })
      ).rejects.toThrow("STATUS_STATION_REQUIRED");
    });
  });

  describe("Status Deletion and Reassignment", () => {
    it("should reassign events to fallback when status is deleted", async () => {
      // Create a non-protected status
      const labelHe = testId("deletable_status");
      const status = await createStatusDefinition({
        scope: "global",
        label_he: labelHe,
        color_hex: "#8b5cf6",
        machine_state: "setup",
      });

      // Create a session and status event using this status
      const testWorker = await TestFactory.createWorker("delete_test");
      const testStation2 = await TestFactory.createStation("delete_test");
      const testJob = await TestFactory.createJob("delete_test");

      const supabase = getTestSupabase();

      // Create session with this status
      const { data: session } = await supabase
        .from("sessions")
        .insert({
          worker_id: testWorker.id,
          station_id: testStation2.id,
          job_id: testJob.id,
          status: "active",
          current_status_id: status.id,
        })
        .select("*")
        .single();

      // Create a status event
      await supabase.from("status_events").insert({
        session_id: session!.id,
        status_definition_id: status.id,
        started_at: new Date().toISOString(),
      });

      // Delete the status
      await deleteStatusDefinition(status.id);

      // Verify events were reassigned to fallback (אחר status)
      const { data: events } = await supabase
        .from("status_events")
        .select("status_definition_id")
        .eq("session_id", session!.id);

      expect(events).toBeDefined();
      expect(events!.length).toBeGreaterThan(0);

      // The status should now be the fallback "אחר" status
      const { data: fallbackStatus } = await supabase
        .from("status_definitions")
        .select("id")
        .eq("label_he", "אחר")
        .single();

      expect(events![0].status_definition_id).toBe(fallbackStatus!.id);

      // Cleanup
      await TestCleanup.cleanupSessions([session!.id]);
      await TestCleanup.cleanupJobs([testJob.id]);
      await TestCleanup.cleanupStations([testStation2.id]);
      await TestCleanup.cleanupWorkers([testWorker.id]);
    });
  });

  describe("Status Visibility", () => {
    it("should return global statuses for any station", async () => {
      const statuses = await fetchActiveStatusDefinitions(testStation.id);

      const globalStatuses = statuses.filter((s) => s.scope === "global");
      expect(globalStatuses.length).toBeGreaterThan(0);
    });

    it("should return station-scoped statuses only for that station", async () => {
      // Create a station-specific status
      const labelHe = testId("specific_station");
      const stationStatus = await createStatusDefinition({
        scope: "station",
        station_id: testStation.id,
        label_he: labelHe,
        color_hex: "#06b6d4",
        machine_state: "setup",
      });
      createdStatusIds.push(stationStatus.id);

      // Create another station
      const otherStation = await TestFactory.createStation("other_station");

      // Fetch for the original station - should include the status
      const statusesForStation = await fetchActiveStatusDefinitions(testStation.id);
      const found = statusesForStation.find((s) => s.id === stationStatus.id);
      expect(found).toBeDefined();

      // Fetch for the other station - should NOT include the status
      const statusesForOther = await fetchActiveStatusDefinitions(otherStation.id);
      const notFound = statusesForOther.find((s) => s.id === stationStatus.id);
      expect(notFound).toBeUndefined();

      // Cleanup
      await TestCleanup.cleanupStations([otherStation.id]);
    });
  });
});
