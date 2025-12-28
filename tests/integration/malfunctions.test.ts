import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TestFactory, TestCleanup, getTestSupabase } from "../helpers";
import { testId } from "../setup";

describe("Malfunction State Machine", () => {
  // Test fixtures
  let testStation: { id: string };

  // Track created resources for cleanup
  const createdMalfunctionIds: string[] = [];

  beforeAll(async () => {
    testStation = await TestFactory.createStation("malfunction_test");
  });

  afterAll(async () => {
    await TestCleanup.cleanupMalfunctions(createdMalfunctionIds);
    await TestCleanup.cleanupStations([testStation.id]);
  });

  /**
   * Helper to create a malfunction with a given status
   */
  async function createMalfunction(status: "open" | "known" | "solved") {
    const supabase = getTestSupabase();
    const { data, error } = await supabase
      .from("malfunctions")
      .insert({
        station_id: testStation.id,
        status: status,
        description: testId(`malfunction_${status}`),
      })
      .select("*")
      .single();

    if (error) throw new Error(`Failed to create malfunction: ${error.message}`);
    createdMalfunctionIds.push(data.id);
    return data;
  }

  /**
   * Helper to update malfunction status
   */
  async function updateMalfunctionStatus(id: string, newStatus: string) {
    const supabase = getTestSupabase();
    return supabase
      .from("malfunctions")
      .update({ status: newStatus })
      .eq("id", id)
      .select("*")
      .single();
  }

  describe("Valid Transitions", () => {
    it("should allow open -> known transition", async () => {
      const malfunction = await createMalfunction("open");

      const { data, error } = await updateMalfunctionStatus(malfunction.id, "known");

      expect(error).toBeNull();
      expect(data?.status).toBe("known");
    });

    it("should allow open -> solved transition (direct resolution)", async () => {
      const malfunction = await createMalfunction("open");

      const { data, error } = await updateMalfunctionStatus(malfunction.id, "solved");

      expect(error).toBeNull();
      expect(data?.status).toBe("solved");
    });

    it("should allow known -> solved transition", async () => {
      const malfunction = await createMalfunction("known");

      const { data, error } = await updateMalfunctionStatus(malfunction.id, "solved");

      expect(error).toBeNull();
      expect(data?.status).toBe("solved");
    });
  });

  describe("Invalid Transitions (Blocked by Trigger)", () => {
    it("should block solved -> open transition", async () => {
      const malfunction = await createMalfunction("solved");

      const { error } = await updateMalfunctionStatus(malfunction.id, "open");

      expect(error).not.toBeNull();
      expect(error?.message).toContain("Cannot transition");
    });

    it("should block solved -> known transition", async () => {
      const malfunction = await createMalfunction("solved");

      const { error } = await updateMalfunctionStatus(malfunction.id, "known");

      expect(error).not.toBeNull();
      expect(error?.message).toContain("Cannot transition");
    });

    it("should block known -> open transition (cannot un-acknowledge)", async () => {
      const malfunction = await createMalfunction("known");

      const { error } = await updateMalfunctionStatus(malfunction.id, "open");

      expect(error).not.toBeNull();
      expect(error?.message).toContain("Cannot transition");
    });
  });

  describe("Edge Cases", () => {
    it("should allow updating same status (no-op)", async () => {
      const malfunction = await createMalfunction("open");

      // Update to same status should not trigger error
      const { data, error } = await updateMalfunctionStatus(malfunction.id, "open");

      expect(error).toBeNull();
      expect(data?.status).toBe("open");
    });

    it("should allow updating other fields without affecting state machine", async () => {
      const malfunction = await createMalfunction("open");

      const supabase = getTestSupabase();
      const { data, error } = await supabase
        .from("malfunctions")
        .update({ description: "Updated description" })
        .eq("id", malfunction.id)
        .select("*")
        .single();

      expect(error).toBeNull();
      expect(data?.description).toBe("Updated description");
      expect(data?.status).toBe("open");
    });

    it("should preserve solved status permanently", async () => {
      // Create and solve a malfunction
      const malfunction = await createMalfunction("open");
      await updateMalfunctionStatus(malfunction.id, "solved");

      // Try all possible invalid transitions
      const invalidTransitions = ["open", "known"];

      for (const invalidStatus of invalidTransitions) {
        const { error } = await updateMalfunctionStatus(malfunction.id, invalidStatus);
        expect(error).not.toBeNull();
      }

      // Verify it's still solved
      const supabase = getTestSupabase();
      const { data } = await supabase
        .from("malfunctions")
        .select("status")
        .eq("id", malfunction.id)
        .single();

      expect(data?.status).toBe("solved");
    });
  });
});
