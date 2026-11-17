import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { aiToolDefinitions, runAiTool } from "@/lib/ai/tools/bina-tools";

const enabled = process.env.AI_RUN_LIVE_TOOLS === "1";
const results: unknown[] = [];
describe.skipIf(!enabled)("Approved AI tools against production read models (no writes)", () => {
  it("supplier numeric identity", async () => {
    const result = await runAiTool("get_supplier_evidence", { supplier_code: 60305, limit: 3 });
    expect(result.data).toMatchObject({ supplierCode: 60305, supplierRows: [expect.objectContaining({ supplier_code: 60305 })] });
  });
  for (const definition of aiToolDefinitions) {
    it(definition.name, async () => {
      const started = Date.now();
      const args = {
        limit: 3, bina_id: "28505", work_order_id: 28505,
        domain: "production", supplier_name: "ספק הדגמה", issue: "עיכוב לדוגמה",
      };
      try {
        const result = await runAiTool(definition.name, args);
        results.push({ name: definition.name, ms: Date.now() - started, result });
        expect(result.name).toBe(definition.name);
        expect(result.rowCount).toBeGreaterThanOrEqual(0);
        expect(result.sources.length).toBeGreaterThan(0);
        expect(JSON.stringify(result.data)).not.toContain("\uFFFD");
      } catch (error) {
        results.push({ name: definition.name, ms: Date.now() - started, error: error instanceof Error ? error.message : "FAILED" });
        throw error;
      } finally {
        if (process.env.AI_TEST_OUTPUT) writeFileSync(process.env.AI_TEST_OUTPUT, JSON.stringify(results, null, 2));
      }
    });
  }
});
