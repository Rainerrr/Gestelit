import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  generate: vi.fn(),
  rate: vi.fn(),
  from: vi.fn(),
  queue: [] as unknown[],
  calls: [] as unknown[][],
}));
vi.mock("@/lib/auth/permissions", async (original) => ({
  ...(await original<object>()),
  requireAdminPassword: m.auth,
}));
vi.mock("@/lib/ai/rate-limit", () => ({ checkInMemoryRateLimit: m.rate }));
vi.mock("@/lib/workflows/run-agent", () => ({
  generateWorkflowAgentResult: m.generate,
}));
vi.mock("@/lib/supabase/client", () => ({
  createServiceSupabase: () => ({ from: m.from }),
}));
import { POST, PATCH } from "@/app/api/admin/workflows/agents/runs/route";
import { UnauthorizedError } from "@/lib/auth/permissions";
import { defaultWorkflowAgent } from "@/lib/workflows/agent";
const id = "11111111-1111-4111-8111-111111111111",
  rid = "22222222-2222-4222-8222-222222222222";
const req = (body: unknown, method = "POST") =>
  new Request("http://localhost/api/admin/workflows/agents/runs", {
    method,
    body: JSON.stringify(body),
  });
const ok = (data: unknown) => ({ data, error: null });
const step = (config = defaultWorkflowAgent()) => ({
  id,
  position: 1,
  agent_config: config,
  stations: { name: "דפוס" },
  job_items: {
    id: "item",
    name: "secret product",
    planned_quantity: 100,
    is_active: true,
    jobs: { customer_name: "private customer" },
  },
});
beforeEach(() => {
  vi.clearAllMocks();
  m.queue = [];
  m.calls = [];
  m.auth.mockResolvedValue({});
  m.rate.mockReturnValue({ allowed: true });
  m.generate.mockResolvedValue({
    summary: "סיכום",
    items: ["בדיקה"],
    warnings: [],
  });
  m.from.mockImplementation((table: string) => {
    m.calls.push(["from", table]);
    const q: Record<string, unknown> = {};
    for (const method of ["select", "eq", "insert", "update"])
      q[method] = (...args: unknown[]) => {
        m.calls.push([method, ...args]);
        return q;
      };
    q.maybeSingle = q.single = () => Promise.resolve(m.queue.shift());
    q.then = (resolve: (v: unknown) => void) =>
      Promise.resolve(m.queue.shift()).then(resolve);
    return q;
  });
});
describe("persisted workflow agents", () => {
  it("denies unauthenticated runs before database access", async () => {
    m.auth.mockRejectedValue(new UnauthorizedError("no"));
    expect((await POST(req({ stepId: id, requestId: rid }))).status).toBe(401);
    expect(m.from).not.toHaveBeenCalled();
    expect(m.generate).not.toHaveBeenCalled();
  });
  it("reuses request IDs without a second model call", async () => {
    m.queue = [ok({ id: rid, status: "pending_review", job_item_step_id: id })];
    expect((await POST(req({ stepId: id, requestId: rid }))).status).toBe(200);
    expect(m.generate).not.toHaveBeenCalled();
  });
  it("rejects reusing a request ID for another step", async () => {
    m.queue = [ok({ job_item_step_id: "other" })];
    expect((await POST(req({ stepId: id, requestId: rid }))).status).toBe(409);
  });
  it("uses server snapshot and omits disabled sources, even if caller forges context", async () => {
    m.queue = [
      ok(null),
      ok(
        step({
          ...defaultWorkflowAgent(),
          includeJobContext: false,
          includeProgress: false,
        }),
      ),
      ok({ id: rid }),
      ok({ id: rid, status: "pending_review" }),
    ];
    expect(
      (
        await POST(
          req({
            stepId: id,
            requestId: rid,
            context: { customer_name: "forged" },
          }),
        )
      ).status,
    ).toBe(200);
    const context = m.generate.mock.calls[0][1];
    expect(context).not.toHaveProperty("job");
    expect(context).not.toHaveProperty("stationProgress");
    expect(JSON.stringify(context)).not.toMatch(
      /private customer|secret product|forged/,
    );
    expect(m.calls).toContainEqual(["eq", "status", "running"]);
    expect(
      m.calls.some(
        (c) =>
          c[0] === "update" &&
          (c[1] as { status: string }).status === "pending_review",
      ),
    ).toBe(true);
  });
  it("fetches enabled progress from the selected step and saves it as evidence", async () => {
    m.queue = [
      ok(null),
      ok(step({ ...defaultWorkflowAgent(), includeProgress: true })),
      ok({ good_reported: 17, scrap_reported: 2 }),
      ok({ id: rid }),
      ok({ id: rid }),
    ];
    expect((await POST(req({ stepId: id, requestId: rid }))).status).toBe(200);
    expect(m.generate.mock.calls[0][1]).toMatchObject({
      job: { plannedQuantity: 100 },
      stationProgress: { good_reported: 17, scrap_reported: 2 },
    });
    expect(m.calls).toContainEqual(["eq", "job_item_step_id", id]);
  });
  it("marks provider failure without exposing internals", async () => {
    m.queue = [ok(null), ok(step()), ok({ id: rid }), ok(null)];
    m.generate.mockRejectedValue(new Error("secret provider details"));
    const r = await POST(req({ stepId: id, requestId: rid }));
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain("secret");
    expect(
      m.calls.some(
        (c) =>
          c[0] === "update" && (c[1] as { status: string }).status === "failed",
      ),
    ).toBe(true);
  });
  it("only reviews pending results and rejects a stale second review", async () => {
    m.queue = [ok(null)];
    expect(
      (await PATCH(req({ id: rid, status: "approved" }, "PATCH"))).status,
    ).toBe(409);
    expect(m.calls).toContainEqual(["eq", "status", "pending_review"]);
  });
  it("never accepts a production-state action as review", async () => {
    expect(
      (await PATCH(req({ id: rid, status: "complete_job" }, "PATCH"))).status,
    ).toBe(400);
    expect(m.from).not.toHaveBeenCalled();
  });
});
