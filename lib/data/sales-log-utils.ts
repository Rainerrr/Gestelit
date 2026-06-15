export const SALES_EVENT_TYPES = ["sale", "meeting", "call", "lead", "follow_up"] as const;
export const SALES_STATUSES = ["new", "open", "follow_up", "won", "lost", "done"] as const;
export const SALES_SOURCES = ["manual", "voice", "ai_assisted"] as const;

export type SalesEventType = (typeof SALES_EVENT_TYPES)[number];
export type SalesStatus = (typeof SALES_STATUSES)[number];
export type SalesSource = (typeof SALES_SOURCES)[number];

type SalesPayload = {
  event_type?: unknown;
  event_at?: unknown;
  salesperson?: unknown;
  customer_name?: unknown;
  raw_note?: unknown;
  status?: unknown;
  source?: unknown;
  estimated_revenue?: unknown;
  actual_revenue?: unknown;
  ai_confidence?: unknown;
};

export class SalesValidationError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = "SalesValidationError";
    this.code = code;
  }
}

export function isSalesEventType(value: unknown): value is SalesEventType {
  return typeof value === "string" && SALES_EVENT_TYPES.includes(value as SalesEventType);
}

export function isSalesStatus(value: unknown): value is SalesStatus {
  return typeof value === "string" && SALES_STATUSES.includes(value as SalesStatus);
}

export function isSalesSource(value: unknown): value is SalesSource {
  return typeof value === "string" && SALES_SOURCES.includes(value as SalesSource);
}

export function normalizeSalesText(value: unknown, maxLength = 4000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

export function normalizeSalesNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeSalesInteger(value: unknown) {
  const number = normalizeSalesNumber(value);
  if (number === null) return null;
  return Number.isInteger(number) ? number : null;
}

export function normalizeSalesDateTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

export function normalizeSalesDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return trimmed;
}

export function isSalesAiConfidence(value: unknown): value is "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high";
}

export function validateSalesActivityPayload(payload: SalesPayload) {
  const errors: string[] = [];
  if (!isSalesEventType(payload.event_type)) errors.push("INVALID_EVENT_TYPE");
  if (!normalizeSalesText(payload.salesperson, 120)) errors.push("SALESPERSON_REQUIRED");
  if (!normalizeSalesText(payload.customer_name, 200)) errors.push("CUSTOMER_REQUIRED");
  if (!normalizeSalesText(payload.raw_note, 8000)) errors.push("NOTE_REQUIRED");
  if (payload.status !== undefined && !isSalesStatus(payload.status)) errors.push("INVALID_STATUS");
  if (payload.source !== undefined && !isSalesSource(payload.source)) errors.push("INVALID_SOURCE");
  if (payload.ai_confidence !== undefined && payload.ai_confidence !== null && !isSalesAiConfidence(payload.ai_confidence)) {
    errors.push("INVALID_AI_CONFIDENCE");
  }

  const estimated = normalizeSalesNumber(payload.estimated_revenue);
  if (estimated !== null && estimated < 0) errors.push("INVALID_ESTIMATED_REVENUE");

  const actual = normalizeSalesNumber(payload.actual_revenue);
  if (actual !== null && actual < 0) errors.push("INVALID_ACTUAL_REVENUE");

  return errors;
}

export function validateSalesActivityPatch(payload: Partial<SalesPayload>) {
  const errors: string[] = [];
  if (payload.event_type !== undefined && !isSalesEventType(payload.event_type)) errors.push("INVALID_EVENT_TYPE");
  if (payload.salesperson !== undefined && !normalizeSalesText(payload.salesperson, 120)) errors.push("SALESPERSON_REQUIRED");
  if (payload.customer_name !== undefined && !normalizeSalesText(payload.customer_name, 200)) errors.push("CUSTOMER_REQUIRED");
  if (payload.raw_note !== undefined && !normalizeSalesText(payload.raw_note, 8000)) errors.push("NOTE_REQUIRED");
  if (payload.status !== undefined && !isSalesStatus(payload.status)) errors.push("INVALID_STATUS");
  if (payload.source !== undefined && !isSalesSource(payload.source)) errors.push("INVALID_SOURCE");
  if (payload.ai_confidence !== undefined && payload.ai_confidence !== null && !isSalesAiConfidence(payload.ai_confidence)) {
    errors.push("INVALID_AI_CONFIDENCE");
  }

  const estimated = normalizeSalesNumber(payload.estimated_revenue);
  if (estimated !== null && estimated < 0) errors.push("INVALID_ESTIMATED_REVENUE");

  const actual = normalizeSalesNumber(payload.actual_revenue);
  if (actual !== null && actual < 0) errors.push("INVALID_ACTUAL_REVENUE");

  return errors;
}
