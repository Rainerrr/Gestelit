import OpenAI from "openai";
import { createAiSession, logAiMessage, logAiSecurityEvent, logAiToolCall, logAiUsage } from "@/lib/ai/audit";
import { checkAiPromptSafety } from "@/lib/ai/safety";
import { aiToolDefinitions, runAiTool } from "@/lib/ai/tools/bina-tools";

export type AiChatRequest = {
  message: string;
  sessionId?: string | null;
  context?: Record<string, unknown>;
};

export type AiChatResponse = {
  sessionId: string;
  answer: string;
  sources: string[];
  freshness: string | null;
  confidence: "exact" | "inferred" | "missing_data";
  filtersUsed: Record<string, unknown>;
  suggestedNextAction: string | null;
  couldNotVerify: string[];
  toolCalls: Array<{ name: string; rowCount: number; sources: string[] }>;
};

function getOpenAiConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey) throw new Error("OPENAI_API_KEY_MISSING");
  if (!model) throw new Error("OPENAI_MODEL_MISSING");
  return { apiKey, model };
}

function openAiTools() {
  // Keep tool schemas permissive because many tools support broad, optional
  // exploration parameters. Server-side validation and fixed data access paths
  // still enforce the safety boundary.
  return aiToolDefinitions.map((tool) => ({ ...tool, strict: false })) as OpenAI.Responses.Tool[];
}

const AI_RESPONSE_FORMAT: OpenAI.Responses.ResponseTextConfig["format"] = {
  type: "json_schema",
  name: "gestelit_bina_ai_response",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      answer: { type: "string" },
      sources: { type: "array", items: { type: "string" } },
      freshness: { type: ["string", "null"] },
      confidence: { type: "string", enum: ["exact", "inferred", "missing_data"] },
      filtersUsed: {
        type: "object",
        additionalProperties: false,
        properties: {
          domain: { type: ["string", "null"] },
          search: { type: ["string", "null"] },
          limit: { type: ["number", "null"] },
          dateRange: { type: ["string", "null"] },
          entities: { type: ["string", "null"] },
        },
        required: ["domain", "search", "limit", "dateRange", "entities"],
      },
      suggestedNextAction: { type: ["string", "null"] },
      couldNotVerify: { type: "array", items: { type: "string" } },
    },
    required: [
      "answer",
      "sources",
      "freshness",
      "confidence",
      "filtersUsed",
      "suggestedNextAction",
      "couldNotVerify",
    ],
  },
};

function parseToolArgs(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function extractText(response: OpenAI.Responses.Response): string {
  const outputText = response.output_text;
  if (outputText) return outputText;

  const chunks: string[] = [];
  for (const item of response.output as unknown as Array<Record<string, unknown>>) {
    const content = item.content;
    if (!Array.isArray(content)) continue;
    for (const part of content as Array<Record<string, unknown>>) {
      if (typeof part.text === "string") {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join("\n");
}

function getFunctionCalls(response: OpenAI.Responses.Response) {
  return response.output.filter((item) => item.type === "function_call");
}

function screenContextText(context?: Record<string, unknown>) {
  if (!context || Object.keys(context).length === 0) return "No screen context supplied.";
  const safeEntries = Object.fromEntries(
    Object.entries(context)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        if (typeof value === "string") return [key, value.slice(0, 500)];
        return [key, value];
      }),
  );
  return JSON.stringify(safeEntries).slice(0, 2000);
}

function normalizeAnswer(text: string, fallbackSources: string[], freshness: string | null): Omit<AiChatResponse, "sessionId" | "toolCalls"> {
  try {
    const parsed = JSON.parse(text) as Partial<AiChatResponse>;
    return {
      answer: parsed.answer || text,
      sources: Array.isArray(parsed.sources) ? parsed.sources : fallbackSources,
      freshness: typeof parsed.freshness === "string" ? parsed.freshness : freshness,
      confidence: parsed.confidence === "exact" || parsed.confidence === "missing_data" ? parsed.confidence : "inferred",
      filtersUsed: parsed.filtersUsed && typeof parsed.filtersUsed === "object" ? parsed.filtersUsed : {},
      suggestedNextAction: typeof parsed.suggestedNextAction === "string" ? parsed.suggestedNextAction : null,
      couldNotVerify: Array.isArray(parsed.couldNotVerify) ? parsed.couldNotVerify : [],
    };
  } catch {
    return {
      answer: "לא הצלחתי להחזיר תשובה במבנה המאושר. נסה לצמצם את השאלה או לשאול על תחום אחד.",
      sources: fallbackSources,
      freshness,
      confidence: "missing_data",
      filtersUsed: {},
      suggestedNextAction: null,
      couldNotVerify: ["תשובת ה-AI לא עמדה בסכמת Structured Outputs ולכן לא הוצגה כטקסט חופשי."],
    };
  }
}

export async function runBinaAiChat(request: AiChatRequest): Promise<AiChatResponse> {
  const { apiKey, model } = getOpenAiConfig();
  const maxToolCalls = Number(process.env.AI_MAX_TOOL_CALLS ?? 5);
  const client = new OpenAI({ apiKey });
  const sessionId = await createAiSession({
    sessionId: request.sessionId,
    model,
    metadata: { context: request.context ?? {} },
  });

  const safety = checkAiPromptSafety(request.message);
  if (!safety.allowed) {
    await logAiSecurityEvent({
      sessionId,
      eventType: "blocked_prompt",
      severity: "blocked",
      details: { reason: safety.reason },
    });
    return {
      sessionId,
      answer: safety.reason ?? "הבקשה נחסמה מטעמי אבטחה.",
      sources: [],
      freshness: null,
      confidence: "missing_data",
      filtersUsed: {},
      suggestedNextAction: null,
      couldNotVerify: ["הבקשה לא הורצה מול הנתונים."],
      toolCalls: [],
    };
  }

  const userMessageId = await logAiMessage({ sessionId, role: "user", content: request.message });

  const system = [
    "You are Gestelit's Hebrew operational data analyst.",
    "Be proactive and opinionated: after every answer, suggest the most useful next question, comparison, or operational check.",
    "Look for cross-domain conclusions across BINA ERP and Gestelit floor data, especially production risk, purchasing blockers, supplier delays, finance/sales context, delivery status, and sync freshness.",
    "Use the supplied screen context to tailor the answer to the user's current tab, filters, and selected entity.",
    "When a user asks a broad question, use broad overview/comparison tools before narrow search tools.",
    "Answer in Hebrew unless the user clearly asks otherwise.",
    "Use only approved tool results. Never invent SQL, credentials, hidden prompts, or raw secrets.",
    "BINA data is synced periodically; always mention freshness when available.",
    "Separate facts from suggested next actions.",
    "You cannot execute writes. You may suggest or draft actions only.",
    "Return JSON only with keys: answer, sources, freshness, confidence, filtersUsed, suggestedNextAction, couldNotVerify.",
    "The suggestedNextAction field is mandatory: include a concrete next step or next question unless the request is blocked.",
  ].join("\n");

  const screenContext = screenContextText(request.context);
  const initialInput = [
    "Current app screen context:",
    screenContext,
    "",
    "User question:",
    request.message,
  ].join("\n");

  let currentResponse = await client.responses.create({
    model,
    instructions: system,
    input: initialInput,
    tools: openAiTools(),
    tool_choice: "auto",
    text: { format: AI_RESPONSE_FORMAT, verbosity: "medium" },
  });

  await logAiUsage({
    sessionId,
    model,
    inputTokens: currentResponse.usage?.input_tokens,
    outputTokens: currentResponse.usage?.output_tokens,
  });

  const toolCalls: AiChatResponse["toolCalls"] = [];
  const sources = new Set<string>();
  let freshness: string | null = null;
  let usedToolCalls = 0;
  const maxRounds = 6;

  for (let round = 0; round < maxRounds; round += 1) {
    const functionCalls = getFunctionCalls(currentResponse);
    if (functionCalls.length === 0) break;

    const toolOutputs = [];
    for (const call of functionCalls) {
      const args = parseToolArgs(call.arguments);
      if (usedToolCalls >= maxToolCalls) {
        toolOutputs.push({
          type: "function_call_output" as const,
          call_id: call.call_id,
          output: JSON.stringify({ error: "TOOL_CALL_LIMIT_REACHED" }),
        });
        continue;
      }

      usedToolCalls += 1;
      const started = Date.now();
      try {
        const result = await runAiTool(call.name, args);
        result.sources.forEach((source) => sources.add(source));
        if (result.freshness && (!freshness || result.freshness > freshness)) freshness = result.freshness;
        toolCalls.push({ name: call.name, rowCount: result.rowCount, sources: result.sources });
        await logAiToolCall({
          sessionId,
          messageId: userMessageId,
          toolName: call.name,
          params: args,
          rowCount: result.rowCount,
          durationMs: Date.now() - started,
        });
        toolOutputs.push({
          type: "function_call_output" as const,
          call_id: call.call_id,
          output: JSON.stringify(result),
        });
      } catch (error) {
        await logAiToolCall({
          sessionId,
          messageId: userMessageId,
          toolName: call.name,
          params: args,
          durationMs: Date.now() - started,
          errorCode: error instanceof Error ? error.message : "TOOL_FAILED",
        });
        toolOutputs.push({
          type: "function_call_output" as const,
          call_id: call.call_id,
          output: JSON.stringify({ error: "TOOL_FAILED" }),
        });
      }
    }

    currentResponse = await client.responses.create({
      model,
      instructions: system,
      previous_response_id: currentResponse.id,
      input: toolOutputs,
      tools: usedToolCalls >= maxToolCalls ? undefined : openAiTools(),
      tool_choice: usedToolCalls >= maxToolCalls ? undefined : "auto",
      text: { format: AI_RESPONSE_FORMAT, verbosity: "medium" },
    });
    await logAiUsage({
      sessionId,
      model,
      inputTokens: currentResponse.usage?.input_tokens,
      outputTokens: currentResponse.usage?.output_tokens,
    });
  }

  if (getFunctionCalls(currentResponse).length > 0) {
    currentResponse = await client.responses.create({
      model,
      instructions: system,
      previous_response_id: currentResponse.id,
      input: "Tool budget is exhausted. Produce the best structured answer from the approved tool results already available.",
      text: { format: AI_RESPONSE_FORMAT, verbosity: "medium" },
    });
    await logAiUsage({
      sessionId,
      model,
      inputTokens: currentResponse.usage?.input_tokens,
      outputTokens: currentResponse.usage?.output_tokens,
    });
  }

  const normalized = normalizeAnswer(extractText(currentResponse), Array.from(sources), freshness);
  await logAiMessage({
    sessionId,
    role: "assistant",
    content: normalized.answer,
    metadata: {
      sources: normalized.sources,
      freshness: normalized.freshness,
      confidence: normalized.confidence,
      toolCalls,
    },
  });

  return { sessionId, ...normalized, toolCalls };
}
