import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ items: [] as unknown[], blocker: "missing_route_rows", error: null as null | { message: string } }));
vi.mock("@/lib/supabase/client", () => ({ createServiceSupabase: () => ({ from: (table: string) => {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"]) chain[method] = () => chain;
  const result = () => table === "mart_bina_work_order_decision_facts"
    ? { data: { bina_id: "qa", work_order_id: 1, gestelit_job_id: "job", blocker_type: state.blocker, priority_score: 25 }, error: null }
    : table === "job_items" ? { data: state.items, error: state.error } : { data: [], error: null };
  chain.maybeSingle = async () => result();
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
  return chain;
} }) }));
vi.mock("@/lib/data/jobs", () => ({}));
vi.mock("@/lib/data/job-items", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
import { fetchBinaWorkOrderDetail } from "@/lib/data/bina";
beforeEach(() => { state.items = []; state.error = null; state.blocker = "missing_route_rows"; });
describe("reviewed MES route versus BINA operations", () => {
  it("recognizes an active route despite absent BINA operations", async () => {
    state.items = [{ job_item_steps: [{ stations: { is_active: true } }] }];
    const detail = await fetchBinaWorkOrderDetail("qa");
    expect(detail.decision?.blocker_type).toBe("ready_or_linked");
    expect(detail.decision?.priority_score).toBe(0);
    expect(detail.productionRows).toEqual([]);
  });
  it.each([{ items: [] }, { items: [{ job_item_steps: [] }] }, { items: [{ job_item_steps: [{ stations: { is_active: false } }] }] }])("does not claim readiness for missing or inactive routes: %j", async ({ items }) => {
    state.items = items;
    expect((await fetchBinaWorkOrderDetail("qa")).decision?.blocker_type).toBe("missing_route_rows");
  });
  it("does not hide an unrelated operational blocker", async () => {
    state.blocker = "quantity_mismatch";
    state.items = [{ job_item_steps: [{ stations: { is_active: true } }] }];
    expect((await fetchBinaWorkOrderDetail("qa")).decision?.blocker_type).toBe("quantity_mismatch");
  });
  it("fails visibly when the actual route cannot be verified", async () => {
    state.error = { message: "route unavailable" };
    await expect(fetchBinaWorkOrderDetail("qa")).rejects.toThrow("route unavailable");
  });
});
