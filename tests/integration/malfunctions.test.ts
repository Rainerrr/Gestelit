import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TestFactory, TestCleanup, getTestSupabase } from "../helpers";
import { testId } from "../setup";

describe("Report State Machine", () => {
  // Test fixtures
  let testStation: { id: string };

  // Track created resources for cleanup
  const createdReportIds: string[] = [];

  beforeAll(async () => {
    testStation = await TestFactory.createStation("report_test");
  });

  afterAll(async () => {
    await TestCleanup.cleanupReports(createdReportIds);
    await TestCleanup.cleanupStations([testStation.id]);
  });

  /**
   * Helper to create a malfunction report with a given status.
   * Note: The set_report_default_status trigger forces malfunction reports to start as 'open',
   * so we must transition to the desired status after creation.
   */
  async function createMalfunctionReport(status: "open" | "known" | "solved") {
    const supabase = getTestSupabase();

    // Create report (will start as 'open' due to default status trigger)
    const { data, error } = await supabase
      .from("reports")
      .insert({
        type: "malfunction",
        station_id: testStation.id,
        description: testId(`report_${status}`),
      })
      .select("*")
      .single();

    if (error) throw new Error(`Failed to create report: ${error.message}`);
    createdReportIds.push(data.id);

    // If requested status is not 'open', transition to it
    if (status === "known") {
      const { data: updated, error: updateError } = await supabase
        .from("reports")
        .update({ status: "known" })
        .eq("id", data.id)
        .select("*")
        .single();
      if (updateError) throw new Error(`Failed to transition to known: ${updateError.message}`);
      return updated;
    }

    if (status === "solved") {
      // Transition open -> solved (valid direct resolution)
      const { data: updated, error: updateError } = await supabase
        .from("reports")
        .update({ status: "solved" })
        .eq("id", data.id)
        .select("*")
        .single();
      if (updateError) throw new Error(`Failed to transition to solved: ${updateError.message}`);
      return updated;
    }

    return data;
  }

  /**
   * Helper to update report status
   */
  async function updateReportStatus(id: string, newStatus: string) {
    const supabase = getTestSupabase();
    return supabase
      .from("reports")
      .update({ status: newStatus })
      .eq("id", id)
      .select("*")
      .single();
  }

  describe("Valid Transitions (Malfunction Reports)", () => {
    it("should allow open -> known transition", async () => {
      const report = await createMalfunctionReport("open");

      const { data, error } = await updateReportStatus(report.id, "known");

      expect(error).toBeNull();
      expect(data?.status).toBe("known");
    });

    it("should allow open -> solved transition (direct resolution)", async () => {
      const report = await createMalfunctionReport("open");

      const { data, error } = await updateReportStatus(report.id, "solved");

      expect(error).toBeNull();
      expect(data?.status).toBe("solved");
    });

    it("should allow known -> solved transition", async () => {
      const report = await createMalfunctionReport("known");

      const { data, error } = await updateReportStatus(report.id, "solved");

      expect(error).toBeNull();
      expect(data?.status).toBe("solved");
    });

    it("should allow solved -> open transition (return from archive)", async () => {
      const report = await createMalfunctionReport("solved");

      const { data, error } = await updateReportStatus(report.id, "open");

      expect(error).toBeNull();
      expect(data?.status).toBe("open");
    });
  });

  describe("Invalid Transitions (Blocked by Trigger)", () => {
    it("should block solved -> known transition", async () => {
      const report = await createMalfunctionReport("solved");

      const { error } = await updateReportStatus(report.id, "known");

      expect(error).not.toBeNull();
      expect(error?.message).toContain("transition");
    });

    it("should block known -> open transition (cannot un-acknowledge)", async () => {
      const report = await createMalfunctionReport("known");

      const { error } = await updateReportStatus(report.id, "open");

      expect(error).not.toBeNull();
      expect(error?.message).toContain("transition");
    });
  });

  describe("Edge Cases", () => {
    it("should allow updating same status (no-op)", async () => {
      const report = await createMalfunctionReport("open");

      // Update to same status should not trigger error
      const { data, error } = await updateReportStatus(report.id, "open");

      expect(error).toBeNull();
      expect(data?.status).toBe("open");
    });

    it("should allow updating other fields without affecting state machine", async () => {
      const report = await createMalfunctionReport("open");

      const supabase = getTestSupabase();
      const { data, error } = await supabase
        .from("reports")
        .update({ description: "Updated description" })
        .eq("id", report.id)
        .select("*")
        .single();

      expect(error).toBeNull();
      expect(data?.description).toBe("Updated description");
      expect(data?.status).toBe("open");
    });
  });

  describe("General/Scrap Reports State Machine", () => {
    it("should allow new -> approved transition for general reports", async () => {
      const supabase = getTestSupabase();
      const { data: report, error: createError } = await supabase
        .from("reports")
        .insert({
          type: "general",
          station_id: testStation.id,
          status: "new",
          description: testId("general_report"),
        })
        .select("*")
        .single();

      if (createError) throw new Error(`Failed to create report: ${createError.message}`);
      createdReportIds.push(report.id);

      const { data, error } = await updateReportStatus(report.id, "approved");

      expect(error).toBeNull();
      expect(data?.status).toBe("approved");
    });

    it("should block approved -> new transition for general reports", async () => {
      const supabase = getTestSupabase();
      const { data: report, error: createError } = await supabase
        .from("reports")
        .insert({
          type: "general",
          station_id: testStation.id,
          status: "new",
          description: testId("general_report_2"),
        })
        .select("*")
        .single();

      if (createError) throw new Error(`Failed to create report: ${createError.message}`);
      createdReportIds.push(report.id);

      // First transition to approved
      await updateReportStatus(report.id, "approved");

      // Try to transition back to new
      const { error } = await updateReportStatus(report.id, "new");

      expect(error).not.toBeNull();
      expect(error?.message).toContain("transition");
    });
  });
});
