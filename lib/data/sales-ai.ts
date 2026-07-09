import OpenAI from "openai";
import {
  isSalesAiConfidence,
  isSalesStatus,
  normalizeSalesDate,
  normalizeSalesNumber,
  normalizeSalesText,
} from "@/lib/data/sales-log-utils";

const SALES_SUMMARY_FORMAT: OpenAI.Responses.ResponseTextConfig["format"] = {
  type: "json_schema",
  name: "gestelit_sales_activity_summary",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      customerIntent: { type: "string" },
      revenueSignal: { type: ["number", "null"] },
      nextAction: { type: ["string", "null"] },
      nextActionDate: { type: ["string", "null"] },
      riskOrObjection: { type: ["string", "null"] },
      productsDiscussed: { type: "array", items: { type: "string" } },
      suggestedStatus: { type: "string", enum: ["new", "open", "follow_up", "won", "lost"] },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
    },
    required: [
      "summary",
      "customerIntent",
      "revenueSignal",
      "nextAction",
      "nextActionDate",
      "riskOrObjection",
      "productsDiscussed",
      "suggestedStatus",
      "confidence",
    ],
  },
};

function getOpenAiConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey) throw new Error("OPENAI_API_KEY_MISSING");
  if (!model) throw new Error("OPENAI_MODEL_MISSING");
  return { apiKey, model };
}

function cleanString(value: unknown, maxLength: number) {
  return normalizeSalesText(value, maxLength);
}

function parseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("AI_SUMMARY_INVALID_JSON");
  }
}

function validateSummary(payload: unknown) {
  if (!payload || typeof payload !== "object") throw new Error("AI_SUMMARY_INVALID");
  const record = payload as Record<string, unknown>;
  const summary = cleanString(record.summary, 1200);
  if (!summary) throw new Error("AI_SUMMARY_EMPTY");

  const revenue = normalizeSalesNumber(record.revenueSignal);
  const products = Array.isArray(record.productsDiscussed)
    ? record.productsDiscussed.map((item) => cleanString(item, 120)).filter(Boolean).slice(0, 12)
    : [];

  return {
    summary,
    customerIntent: cleanString(record.customerIntent, 240) || "לא זוהה",
    revenueSignal: revenue !== null && revenue >= 0 ? revenue : null,
    nextAction: cleanString(record.nextAction, 400) || null,
    nextActionDate: normalizeSalesDate(record.nextActionDate),
    riskOrObjection: cleanString(record.riskOrObjection, 400) || null,
    productsDiscussed: products,
    suggestedStatus: isSalesStatus(record.suggestedStatus) ? record.suggestedStatus : "open",
    confidence: isSalesAiConfidence(record.confidence) ? record.confidence : "low",
  };
}

export async function summarizeSalesActivityNote(input: {
  rawNote: unknown;
  eventType?: unknown;
  customerName?: unknown;
  salesperson?: unknown;
}) {
  const rawNote = normalizeSalesText(input.rawNote, 8000);
  if (!rawNote) {
    throw new Error("NOTE_REQUIRED");
  }

  const { apiKey, model } = getOpenAiConfig();
  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model,
    instructions: [
      "You summarize sales activity notes for a Hebrew manufacturing operations system.",
      "Keep the output business-oriented: customer intent, opportunity, objection, next action, and revenue signal.",
      "Do not invent exact numbers. If revenue is unclear, return null.",
      "Prefer Hebrew wording. Dates should be ISO YYYY-MM-DD when inferred from the note, otherwise null.",
      "Return only the structured JSON schema.",
    ].join("\n"),
    input: JSON.stringify({
      eventType: normalizeSalesText(input.eventType, 40),
      customerName: normalizeSalesText(input.customerName, 200),
      salesperson: normalizeSalesText(input.salesperson, 120),
      rawNote,
    }),
    text: { format: SALES_SUMMARY_FORMAT, verbosity: "medium" },
  });

  return validateSummary(parseJson(response.output_text ?? ""));
}
