import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), run: vi.fn() }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/auth/permissions")>(), requireAdminPassword: mocks.auth }));
vi.mock("@/lib/ai/chat-orchestrator", () => ({ runBinaAiChat: mocks.run }));
vi.mock("@/lib/ai/rate-limit", () => ({ checkInMemoryRateLimit: () => ({ allowed: true }) }));
import { POST } from "@/app/api/admin/ai/chat/route";
import { NotFoundError, UnauthorizedError } from "@/lib/auth/permissions";
beforeEach(() => { vi.clearAllMocks();mocks.auth.mockResolvedValue({ sessionToken: "test" }); mocks.run.mockResolvedValue({ answer: "תשובה" }); });
const request = (body: unknown) => new Request("https://example.test/api/admin/ai/chat", { method: "POST", body: JSON.stringify(body) });
describe("AI HTTP validation", () => {
  it.each(["bad", 123, {}, []])("rejects an invalid session ID before touching storage: %s", async (sessionId) => {
    expect((await POST(request({ message: "בדיקה", sessionId }))).status).toBe(400);expect(mocks.run).not.toHaveBeenCalled();
  });
  it("returns 404 for a missing conversation", async () => {
    mocks.run.mockRejectedValue(new NotFoundError("AI session not found"));expect((await POST(request({ message: "בדיקה" }))).status).toBe(404);
  });
  it("does not expose provider or database internals", async () => {
    mocks.run.mockRejectedValue(new Error("secret provider connection details"));
    const result = await POST(request({ message: "בדיקה" }));expect(result.status).toBe(500);expect(await result.json()).toEqual({ error: "AI_CHAT_FAILED" });
  });
  it("checks authentication before invoking the model", async () => {
    mocks.auth.mockRejectedValue(new UnauthorizedError("Login required"));expect((await POST(request({ message: "בדיקה" }))).status).toBe(401);expect(mocks.run).not.toHaveBeenCalled();
  });
});
