import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({ default: class { responses = { create: mocks.create }; } }));
import { summarizeSalesActivityNote } from "@/lib/data/sales-ai";
import { SalesValidationError } from "@/lib/data/sales-log-utils";
beforeEach(() => { vi.clearAllMocks();vi.stubEnv("OPENAI_API_KEY", "test-only");vi.stubEnv("OPENAI_MODEL", "test"); });
describe("Sales AI validation", () => {
  it("rejects blank notes as input errors without spending an API call", async () => {
    await expect(summarizeSalesActivityNote({ rawNote: "  " })).rejects.toBeInstanceOf(SalesValidationError);expect(mocks.create).not.toHaveBeenCalled();
  });
  it("supplies the Israel calendar date for relative follow-up dates and preserves unknown revenue", async () => {
    vi.useFakeTimers();vi.setSystemTime(new Date("2026-11-17T23:00:00Z"));
    mocks.create.mockResolvedValue({ output_text: JSON.stringify({ summary: "להתקשר מחר", revenueSignal: null, nextActionDate: "2026-11-19", suggestedStatus: "follow_up", confidence: "medium" }) });
    try {
      const result = await summarizeSalesActivityNote({ rawNote: "להתקשר מחר, אין סכום" });
      expect(mocks.create.mock.calls[0][0].instructions).toContain("2026-11-18");expect(result.revenueSignal).toBeNull();expect(result.nextActionDate).toBe("2026-11-19");
    } finally { vi.useRealTimers(); }
  });
});
