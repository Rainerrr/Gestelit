import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  catalog: vi.fn(),
  create: vi.fn(),
  rate: vi.fn(),
}));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireAdminPassword: m.auth,
}));
vi.mock("@/lib/data/workflow-catalog", () => ({
  fetchWorkflowCatalog: m.catalog,
}));
vi.mock("@/lib/ai/rate-limit", () => ({ checkInMemoryRateLimit: m.rate }));
vi.mock("openai", () => ({
  default: class {
    responses = { create: m.create };
  },
}));
import { POST } from "@/app/api/admin/ai/workflow/route";
import { UnauthorizedError } from "@/lib/auth/permissions";
import { validateWorkflowPlan } from "@/lib/workflows/plan";
import {
  validateAgentConfig,
  validateAgentMap,
  defaultWorkflowAgent,
  validateAgentResult,
} from "@/lib/workflows/agent";
import { generateWorkflowAgentResult } from "@/lib/workflows/run-agent";
const catalog = [
  {
    id: "a",
    name: "דפוס",
    code: "A",
    station_type: "production",
    is_active: true,
  },
  { id: "b", name: "חיתוך", is_active: false },
];
const plan = {
  name: "דפוס",
  summary: "טיוטה",
  steps: [
    { stationId: "a", reason: "הדפסה", requiresFirstProductApproval: true },
  ],
  warnings: [],
  handoff: [],
};
const request = (body: unknown) =>
  new Request("http://localhost/api/admin/ai/workflow", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({});
  m.catalog.mockResolvedValue(catalog.filter((s) => s.is_active));
  m.rate.mockReturnValue({ allowed: true });
  m.create.mockResolvedValue({
    status: "completed",
    output_text: JSON.stringify(plan),
  });
  process.env.OPENAI_API_KEY = "test";
  process.env.OPENAI_MODEL = "test";
});
describe("workflow planning boundaries", () => {
  it("authenticates before reading the catalog or using the model", async () => {
    m.auth.mockRejectedValue(new UnauthorizedError("no"));
    expect((await POST(request({}))).status).toBe(401);
    expect(m.catalog).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
  it("returns a catalog-validated draft without persistence", async () => {
    const r = await POST(request({ mode: "draft", prompt: "דפוס", steps: [] }));
    expect(r.status).toBe(200);
    expect((await r.json()).plan).toEqual(plan);
    expect(m.create.mock.calls[0][0]).toMatchObject({ store: false });
  });
  it.each([
    {},
    {
      mode: "draft",
      prompt: "x",
      steps: [{ stationId: "unknown", requiresFirstProductApproval: false }],
    },
    { mode: "review", prompt: "x", steps: [] },
  ])("rejects invalid input %j", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("enforces rate limiting before provider use", async () => {
    m.rate.mockReturnValue({ allowed: false });
    expect(
      (await POST(request({ mode: "draft", prompt: "x", steps: [] }))).status,
    ).toBe(429);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("rejects a review that modifies the saved order or flags", async () => {
    const r = await POST(
      request({
        mode: "review",
        prompt: "x",
        steps: [{ stationId: "a", requiresFirstProductApproval: false }],
      }),
    );
    expect(r.status).toBe(500);
  });
  it.each(["unknown", "b"])(
    "rejects invented or inactive station %s",
    (stationId) => {
      expect(() =>
        validateWorkflowPlan(
          { ...plan, steps: [{ ...plan.steps[0], stationId }] },
          catalog,
        ),
      ).toThrow();
    },
  );
  it("rejects duplicate stations and unexplained empty routes", () => {
    expect(() =>
      validateWorkflowPlan(
        { ...plan, steps: [...plan.steps, ...plan.steps] },
        catalog,
      ),
    ).toThrow();
    expect(() =>
      validateWorkflowPlan({ ...plan, steps: [] }, catalog),
    ).toThrow();
    expect(
      validateWorkflowPlan(
        { ...plan, steps: [], warnings: ["חסר מידע"] },
        catalog,
      ).steps,
    ).toEqual([]);
  });
  it("does not expose provider secrets or accept incomplete output", async () => {
    m.create.mockRejectedValueOnce(new Error("private key"));
    const r = await POST(request({ mode: "draft", prompt: "x", steps: [] }));
    expect(await r.text()).not.toContain("private key");
    m.create.mockResolvedValueOnce({
      status: "incomplete",
      output_text: JSON.stringify(plan),
    });
    expect(
      (await POST(request({ mode: "draft", prompt: "x", steps: [] }))).status,
    ).toBe(502);
  });
});
describe("station agent settings and results", () => {
  it("normalizes only approved configuration fields", () => {
    const result = validateAgentConfig({
      ...defaultWorkflowAgent(),
      sql: "delete from jobs",
      name: "  עוזר  ",
    });
    expect(result?.name).toBe("עוזר");
    expect(result).not.toHaveProperty("sql");
  });
  it.each([
    { trigger: "automatic" },
    { requiresReview: false },
    { includeProgress: "yes" },
    { instructions: "" },
    { output: "execute_sql" },
  ])("rejects unsafe or invalid settings %j", (changes) => {
    expect(() =>
      validateAgentConfig({ ...defaultWorkflowAgent(), ...changes }),
    ).toThrow();
  });
  it("rejects attaching an agent to a station outside the route", () => {
    expect(() =>
      validateAgentMap({ other: defaultWorkflowAgent() }, ["a"]),
    ).toThrow();
  });
  it("requires complete bounded model results", () => {
    expect(() =>
      validateAgentResult({ summary: "ok", items: [null], warnings: [] }),
    ).toThrow();
  });
  it("passes only the supplied scoped snapshot to the provider, without tools", async () => {
    m.create.mockResolvedValue({
      status: "completed",
      output_text: JSON.stringify({
        summary: "בדיקה",
        items: ["בדקו קובץ"],
        warnings: [],
      }),
    });
    await generateWorkflowAgentResult(
      defaultWorkflowAgent(),
      { station: "דפוס" },
      new AbortController().signal,
    );
    const args = m.create.mock.calls[0][0];
    expect(JSON.parse(args.input).context).toEqual({ station: "דפוס" });
    expect(args).not.toHaveProperty("tools");
    expect(args.store).toBe(false);
  });
});
