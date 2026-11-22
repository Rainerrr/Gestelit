import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  from: vi.fn(),
  queue: [] as unknown[],
  inserts: [] as { table: string; data: unknown }[],
}));
vi.mock("@/lib/supabase/client", () => ({
  createServiceSupabase: () => ({ from: m.from }),
}));
import { createJobItem } from "@/lib/data/job-items";
import { defaultWorkflowAgent } from "@/lib/workflows/agent";
const ok = (data: unknown) => ({ data, error: null });
beforeEach(() => {
  m.queue = [];
  m.inserts = [];
  m.from.mockReset();
  m.from.mockImplementation((table: string) => {
    const q: Record<string, unknown> = {};
    for (const key of ["select", "eq", "order"]) q[key] = () => q;
    q.insert = (data: unknown) => {
      m.inserts.push({ table, data });
      return q;
    };
    q.single = q.maybeSingle = () => Promise.resolve(m.queue.shift());
    q.then = (resolve: (value: unknown) => void) =>
      Promise.resolve(m.queue.shift()).then(resolve);
    return q;
  });
});
it("preset-only product creation snapshots approval flags and agent configuration in station order", async () => {
  const agent = defaultWorkflowAgent();
  m.queue = [
    ok({
      id: "preset",
      is_active: true,
      pipeline_preset_steps: [
        {
          station_id: "b",
          position: 2,
          requires_first_product_approval: false,
          agent_config: null,
        },
        {
          station_id: "a",
          position: 1,
          requires_first_product_approval: true,
          agent_config: agent,
        },
      ],
    }),
    ok({ id: "item", job_id: "job" }),
    ok([
      { id: "step-a", station_id: "a", position: 1 },
      { id: "step-b", station_id: "b", position: 2 },
    ]),
    ok(null),
    ok(null),
    ok({ id: "item", job_id: "job", job_item_steps: [] }),
  ];
  await createJobItem({
    job_id: "job",
    name: "product",
    planned_quantity: 120,
    pipeline_preset_id: "preset",
  });
  expect(m.inserts.find((x) => x.table === "job_item_steps")?.data).toEqual([
    {
      job_item_id: "item",
      station_id: "a",
      position: 1,
      is_terminal: false,
      requires_first_product_approval: true,
      agent_config: agent,
    },
    {
      job_item_id: "item",
      station_id: "b",
      position: 2,
      is_terminal: true,
      requires_first_product_approval: false,
      agent_config: null,
    },
  ]);
  expect(m.inserts.find((x) => x.table === "wip_balances")?.data).toHaveLength(
    2,
  );
});
it("rejects malformed custom agent configuration before creating a product", async () => {
  await expect(
    createJobItem({
      job_id: "job",
      name: "product",
      planned_quantity: 1,
      station_ids: ["a"],
      agent_configs: { a: { ...defaultWorkflowAgent(), instructions: "" } },
    }),
  ).rejects.toThrow("INVALID_AGENT_CONFIG");
  expect(m.inserts).toEqual([]);
});
