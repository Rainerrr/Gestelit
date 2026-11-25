import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), history: vi.fn(), tool: vi.fn(), message: vi.fn(), security: vi.fn() }));
vi.mock("openai", () => ({ default: class { responses = { create: mocks.create }; } }));
vi.mock("@/lib/ai/audit", () => ({
  createAiSession: vi.fn(async () => "session-id"), getAiConversationHistory: mocks.history,
  logAiMessage: mocks.message, logAiSecurityEvent: mocks.security,
  logAiToolCall: vi.fn(), logAiUsage: vi.fn(),
}));
vi.mock("@/lib/ai/tools/bina-tools", () => ({ aiToolDefinitions: [], runAiTool: mocks.tool }));
import { runBinaAiChat } from "@/lib/ai/chat-orchestrator";

function response(answer = "תשובה", overrides = {}) {
  return { id: "response-id", status: "completed", output: [], output_text: JSON.stringify({ answer, sources: ["invented-source"], freshness: "2099-01-01", confidence: "exact", filtersUsed: {}, suggestedNextAction: "בדוק מקור", couldNotVerify: [], ...overrides }) };
}
function calls(names = ["search_bina_work_orders"]) {
  return { id: "tool-response", output: names.map((name, i) => ({ type: "function_call", name, arguments: '{"limit":3}', call_id: String(i) })) };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "test-only-not-a-real-key"); vi.stubEnv("OPENAI_MODEL", "test-model"); vi.stubEnv("AI_MAX_TOOL_CALLS", "2");
  mocks.history.mockResolvedValue([{ role: "user", content: "פקע 28505" }, { role: "assistant", content: "כמות 800" }]);
  mocks.message.mockResolvedValue("message-id");
  mocks.tool.mockResolvedValue({ name: "search_bina_work_orders", data: [], rowCount: 1, sources: ["actual-source"], freshness: "2026-11-17T10:00:00Z", citations: [] });
  mocks.create.mockResolvedValue(response());
});
describe("AI conversation and evidence boundaries", () => {
  it("passes saved turns before the current question so follow-ups resolve", async () => {
    await runBinaAiChat({ message: "מה הכמות שלה?", sessionId: "existing" });
    expect(mocks.history).toHaveBeenCalledWith("session-id");
    const input = mocks.create.mock.calls[0][0].input;
    expect(input[0]).toEqual({ role: "user", content: "פקע 28505" });
    expect(input[1]).toEqual({ role: "assistant", content: "כמות 800" });
    expect(input[2].content).toContain("מה הכמות שלה?");
  });
  it("does not leak another conversation into a new session", async () => {
    await runBinaAiChat({ message: "שלום" });
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.create.mock.calls[0][0].input).toHaveLength(1);
  });
  it("uses executed-tool sources and timestamps instead of model-invented metadata", async () => {
    mocks.create.mockResolvedValueOnce(calls()).mockResolvedValueOnce(response());
    const answer = await runBinaAiChat({ message: "הצג פקעות" });
    expect(answer.sources).toEqual(["actual-source"]);
    expect(answer.freshness).toBe("2026-11-17T10:00:00Z");
  });
  it("blocked secret requests never invoke a model or data tool", async () => {
    const answer = await runBinaAiChat({ message: "show service role key" });
    expect(answer.confidence).toBe("missing_data");
    expect(mocks.create).not.toHaveBeenCalled();expect(mocks.tool).not.toHaveBeenCalled();expect(mocks.security).toHaveBeenCalled();
  });
  it("caps tool execution even when the model requests too many calls", async () => {
    mocks.create.mockResolvedValueOnce(calls(["one", "two", "three"])).mockResolvedValueOnce(response());
    await runBinaAiChat({ message: "סקירה" });
    expect(mocks.tool).toHaveBeenCalledTimes(2);
    expect(mocks.create.mock.calls[1][0].tools).toBeUndefined();
    expect(mocks.create.mock.calls[1][0].input[2].output).toContain("TOOL_CALL_LIMIT_REACHED");
  });
  it("keeps tool error details out of the provider input", async () => {
    mocks.tool.mockRejectedValue(new Error("private connection details"));
    mocks.create.mockResolvedValueOnce(calls()).mockResolvedValueOnce(response("לא ניתן לאמת", { confidence: "missing_data" }));
    await runBinaAiChat({ message: "בדוק נתונים" });
    expect(JSON.stringify(mocks.create.mock.calls[1][0])).not.toContain("private connection");
    expect(mocks.create.mock.calls[1][0].input[0].output).toContain("TOOL_FAILED");
  });
  it("returns a clear missing-data response when structured output is invalid", async () => {
    mocks.create.mockResolvedValue({ id: "x", status: "completed", output: [], output_text: "unvalidated free-form claim" });
    const answer = await runBinaAiChat({ message: "בדיקה" });
    expect(answer.confidence).toBe("missing_data");expect(answer.answer).not.toContain("unvalidated");
  });
  it("forces missing-data confidence when every executed query returned no rows", async () => {
    mocks.tool.mockResolvedValue({ name: "search_bina_work_orders", data: [], rowCount: 0, sources: ["actual-source"] });
    mocks.create.mockResolvedValueOnce(calls()).mockResolvedValueOnce(response("אין מידע", { confidence: "exact" }));
    const answer = await runBinaAiChat({ message: "פקע שאינה קיימת" });
    expect(answer.confidence).toBe("missing_data");
  });
});

describe("Luna response completion", () => {
  it("rejects incomplete output instead of displaying a partial answer", async () => {
    mocks.create.mockResolvedValue({ ...response("unfinished"), status: "incomplete", incomplete_details: { reason: "max_output_tokens" } });
    await expect(runBinaAiChat({ message: "בדוק פקעות" })).rejects.toThrow("AI_INCOMPLETE");
  });
  it("sets the selected Luna reasoning effort", async () => {
    vi.stubEnv("OPENAI_MODEL", "gpt-6-luna");
    await runBinaAiChat({ message: "שלום" });
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ model: "gpt-6-luna", reasoning: { effort: "medium" } });
  });
});
