import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/data/admin-dashboard", () => ({ fetchActiveJobsWithProgress: m.fetch }));
import { runAiTool } from "@/lib/ai/tools/bina-tools";
const make = (id: string) => ({job:{id,job_number:id,customer_name:"לקוח",due_date:"2020-01-01"},jobItems:[],activeSessionCount:0,activeStationIds:[]});
beforeEach(() => { vi.clearAllMocks(); m.fetch.mockResolvedValue([make("100"),make("200")]); });
describe("manufacturing AI source", () => {
 it("reads server data and returns explicit scope and citations", async () => {
  const result = await runAiTool("get_gestelit_manufacturing_overview", {});
  expect(m.fetch).toHaveBeenCalledWith({includeWaiting:true});
  expect(result.rowCount).toBe(2);
  expect(result.sources).toContain("job_item_progress");
  expect(result.citations?.[0].confidence).toBe("exact");
  expect(result.data).toMatchObject({totalMatching:2,truncated:false,summary:{needsSetup:2,withoutSession:2}});
 });
 it("filters requested jobs and discloses result limits", async () => {
  expect((await runAiTool("get_gestelit_manufacturing_overview", {search:"200"})).rowCount).toBe(1);
  expect((await runAiTool("get_gestelit_manufacturing_overview", {limit:1})).data).toMatchObject({totalMatching:2,truncated:true});
 });
 it("propagates a failed source instead of claiming no open jobs", async () => {
  m.fetch.mockRejectedValue(new Error("source unavailable"));
  await expect(runAiTool("get_gestelit_manufacturing_overview", {})).rejects.toThrow("source unavailable");
 });
});
