import OpenAI from "openai";
import { fetchSalesSummary, fetchSalesUserDashboard, type SalesSummary } from "@/lib/data/sales-log";
import { normalizeSalesText } from "@/lib/data/sales-log-utils";

const SALES_CHAT_FORMAT: OpenAI.Responses.ResponseTextConfig["format"] = {
  type: "json_schema",
  name: "gestelit_sales_answer",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      answer: { type: "string" },
      confidence: { type: "string", enum: ["exact", "inferred", "missing_data"] },
      evidence: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            source: { type: "string" },
            label: { type: "string" },
            freshness: { type: ["string", "null"] },
            confidence: { type: "string", enum: ["exact", "inferred", "missing_data"] },
          },
          required: ["source", "label", "freshness", "confidence"],
        },
      },
      filtersUsed: { type: "array", items: { type: "string" } },
      suggestedNextAction: { type: "string" },
      suggestedQuestions: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
      couldNotVerify: { type: "array", items: { type: "string" } },
    },
    required: [
      "answer",
      "confidence",
      "evidence",
      "filtersUsed",
      "suggestedNextAction",
      "suggestedQuestions",
      "couldNotVerify",
    ],
  },
};

const blockedPatterns = [
  /\b(select|insert|update|delete|drop|alter)\b[\s\S]*\b(from|into|table)\b/i,
  /(api[_ -]?key|service[_ -]?role|sql password|sync[_ -]?key|סיסמ[הת]|מפתח api)/i,
  /(כתוב|עדכן|מחק|סגור).*(bina|בינה|חשבונית|לקוח)/i,
];

export function isSalesChatRequestBlocked(message: string) {
  return blockedPatterns.some((pattern) => pattern.test(message));
}

export type SalesChatAnswer = {
  answer: string;
  confidence: "exact" | "inferred" | "missing_data";
  evidence: Array<{
    source: string;
    label: string;
    freshness: string | null;
    confidence: "exact" | "inferred" | "missing_data";
  }>;
  filtersUsed: string[];
  suggestedNextAction: string;
  suggestedQuestions: string[];
  couldNotVerify: string[];
};

function compactSummary(summary: SalesSummary) {
  return {
    activity: {
      today: summary.todayCount,
      week: summary.weekCount,
      openFollowUps: summary.openFollowUps,
      overdueFollowUps: summary.overdueFollowUps,
    },
    outcomes: summary.analytics.funnel,
    eventMix: summary.analytics.eventMix,
    currencies: summary.analytics.currencies,
    reps: summary.analytics.reps.slice(0, 20),
    opportunities: summary.analytics.opportunities.slice(0, 30),
    topClients: summary.topClients.slice(0, 20).map((client) => ({
      customerName: client.customer_name,
      accountManager: client.salesperson,
      activityCount: client.activity_count,
      estimatedPipeline: client.estimated_pipeline,
      lastActivityAt: client.last_activity_at,
      customerGroup: client.customer_group,
    })),
    dataQuality: summary.analytics.dataQuality,
    isTruncated: summary.analytics.isTruncated,
  };
}

function validateAnswer(value: unknown): SalesChatAnswer {
  if (!value || typeof value !== "object") throw new Error("SALES_AI_INVALID_RESPONSE");
  const answer = value as SalesChatAnswer;
  if (!normalizeSalesText(answer.answer, 8000)) throw new Error("SALES_AI_INVALID_RESPONSE");
  return answer;
}

export async function runSalesChat(input: {
  message: string;
  salesUserId: string;
  salesperson: string;
  canViewTeam: boolean;
  requestedScope?: "personal" | "team";
  dateFrom?: string | null;
  dateTo?: string | null;
}) {
  const message = normalizeSalesText(input.message, 3000);
  if (!message) throw new Error("SALES_AI_MESSAGE_REQUIRED");
  if (isSalesChatRequestBlocked(message)) {
    throw new Error("SALES_AI_REQUEST_BLOCKED");
  }

  const scope = input.requestedScope === "team" && input.canViewTeam ? "team" : "personal";
  const dateTo = input.dateTo || new Date().toISOString();
  const dateFrom = input.dateFrom || new Date(Date.now() - 89 * 86_400_000).toISOString();
  const params = { dateFrom, dateTo };
  const summary = scope === "team"
    ? await fetchSalesSummary(params)
    : await fetchSalesUserDashboard(input.salesUserId, params);

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey) throw new Error("OPENAI_API_KEY_MISSING");
  if (!model) throw new Error("OPENAI_MODEL_MISSING");

  const client = new OpenAI({ apiKey });
  const generatedAt = new Date().toISOString();
  const response = await client.responses.create({
    model,
    instructions: [
      "You are the proactive sales operations analyst for Gestelit, an Israeli manufacturing company.",
      "Answer in natural, everyday business Hebrew. Be concise but draw useful comparisons and conclusions.",
      "Use only the supplied deterministic data. Never invent a customer, amount, interaction, BINA history, or ownership.",
      "The current client universe and historical CRM touches from BINA are not complete.",
      "Therefore inactivity means only that no interaction was recorded in Gestelit; never claim the company did not contact a client.",
      "Manual Gestelit activity, BINA invoices, commercial orders, quotes, and production work orders are different grains.",
      "Do not combine currencies. Do not expose credentials. Do not provide SQL or execute changes.",
      "Always suggest a concrete next action and 2-4 useful next questions or comparisons.",
      "Cite mart_sales_activity_scoped for activity analytics and label confidence inferred where contact completeness matters.",
      "Return only the required structured response.",
    ].join("\n"),
    input: JSON.stringify({
      question: message,
      viewer: input.salesperson,
      scope,
      dateFrom,
      dateTo,
      generatedAt,
      coverage: {
        gestelitActivities: "complete_for_authenticated_scope",
        binaClientMaster: "partial_index",
        binaCrmHistory: "not_connected",
        quotesAndCommercialOrders: "not_connected",
      },
      summary: compactSummary(summary),
    }),
    text: { format: SALES_CHAT_FORMAT, verbosity: "medium" },
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.output_text ?? "");
  } catch {
    throw new Error("SALES_AI_INVALID_RESPONSE");
  }
  const answer = validateAnswer(parsed);
  return {
    ...answer,
    scope,
    generatedAt,
    dateFrom,
    dateTo,
  };
}
