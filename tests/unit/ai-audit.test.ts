import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createServiceSupabase: () => ({ from: mocks.from }) }));
import { createAiSession } from "@/lib/ai/audit";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ insert: mocks.insert, select: mocks.select });
  mocks.insert.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ single: mocks.single, eq: mocks.eq });
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  mocks.single.mockResolvedValue({ data: { id: "new-session" }, error: null });
  mocks.maybeSingle.mockResolvedValue({ data: { id: "existing-session" }, error: null });
});
describe("admin conversation titles", () => {
  it("persists the first user question as metadata.title while retaining screen context", async () => {
    await createAiSession({ model: "test-model", initialMessage: "  מה מצב  פקעה 28505?\nומה הצעד הבא?  ", metadata: { context: { routeLabel: "דשבורד" } } });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ metadata: { title: "מה מצב פקעה 28505? ומה הצעד הבא?", context: { routeLabel: "דשבורד" } } }));
  });
  it("bounds the saved title length", async () => {
    await createAiSession({ model: "test-model", initialMessage: "א".repeat(4000) });
    expect(mocks.insert.mock.calls[0][0].metadata.title).toHaveLength(60);
  });
  it("preserves the original title when continuing an existing session", async () => {
    expect(await createAiSession({ sessionId: "existing-session", model: "test-model", initialMessage: "שאלת המשך" })).toBe("existing-session");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
