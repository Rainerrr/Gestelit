import { createServiceSupabase } from "@/lib/supabase/client";
import {
  isSalesEventType,
  isSalesSource,
  isSalesStatus,
  normalizeSalesDate,
  normalizeSalesDateTime,
  normalizeSalesInteger,
  normalizeSalesNumber,
  normalizeSalesText,
  SalesValidationError,
  validateSalesActivityPayload,
  validateSalesActivityPatch,
  type SalesEventType,
  type SalesSource,
  type SalesStatus,
} from "@/lib/data/sales-log-utils";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export type SalesActivityLog = {
  id: string;
  event_type: SalesEventType;
  event_at: string;
  salesperson: string;
  customer_name: string;
  customer_code: number | null;
  contact_person: string | null;
  raw_note: string;
  ai_summary: string | null;
  ai_next_action: string | null;
  next_action_date: string | null;
  estimated_revenue: number | null;
  actual_revenue: number | null;
  currency: string;
  status: SalesStatus;
  source: SalesSource;
  linked_bina_invoice_no: number | null;
  linked_bina_order_no: number | null;
  linked_bina_delivery_no: number | null;
  ai_confidence: "low" | "medium" | "high" | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type SalesClientActivity = {
  customer_code: number | null;
  customer_name: string;
  invoice_count: number;
  invoice_revenue: number;
  last_invoice_at: string | null;
  activity_count: number;
  estimated_pipeline: number;
  last_activity_at: string | null;
  salesperson: string | null;
  combined_score: number;
};

export type SalesSummary = {
  todayCount: number;
  weekCount: number;
  openFollowUps: number;
  overdueFollowUps: number;
  estimatedPipeline: number;
  actualLoggedRevenue: number;
  binaMonthRevenue: number;
  topClients: SalesClientActivity[];
  recentBinaSales: Array<{
    bina_id: string;
    invoice_no: number | null;
    customer_name: string | null;
    invoice_at: string | null;
    total_amount: number | null;
    salesperson: string | null;
  }>;
};

export type SalesListParams = {
  search?: string | null;
  limit?: number | null;
  offset?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  salesperson?: string | null;
  eventType?: string | null;
  status?: string | null;
  nextActionFrom?: string | null;
  nextActionTo?: string | null;
};

export type SalesActivityInput = {
  event_type: SalesEventType;
  event_at?: string | null;
  salesperson: string;
  customer_name: string;
  customer_code?: number | null;
  contact_person?: string | null;
  raw_note: string;
  ai_summary?: string | null;
  ai_next_action?: string | null;
  next_action_date?: string | null;
  estimated_revenue?: number | string | null;
  actual_revenue?: number | string | null;
  currency?: string | null;
  status?: SalesStatus | null;
  source?: SalesSource | null;
  linked_bina_invoice_no?: number | string | null;
  linked_bina_order_no?: number | string | null;
  linked_bina_delivery_no?: number | string | null;
  ai_confidence?: "low" | "medium" | "high" | null;
  metadata?: Record<string, unknown> | null;
};

function clampLimit(value?: number | null) {
  const number = Number(value ?? DEFAULT_LIMIT);
  if (!Number.isFinite(number)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(number)));
}

function likePattern(value?: string | null) {
  const text = normalizeSalesText(value, 120).replaceAll("%", "\\%").replaceAll("_", "\\_");
  return text ? `%${text}%` : null;
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function cleanActivityInput(input: SalesActivityInput) {
  const errors = validateSalesActivityPayload(input);
  if (errors.length > 0) {
    throw new SalesValidationError(errors[0]);
  }

  return {
    event_type: input.event_type,
    event_at: normalizeSalesDateTime(input.event_at),
    salesperson: normalizeSalesText(input.salesperson, 120),
    customer_name: normalizeSalesText(input.customer_name, 200),
    customer_code: normalizeSalesInteger(input.customer_code),
    contact_person: normalizeSalesText(input.contact_person, 120) || null,
    raw_note: normalizeSalesText(input.raw_note, 8000),
    ai_summary: normalizeSalesText(input.ai_summary, 4000) || null,
    ai_next_action: normalizeSalesText(input.ai_next_action, 1000) || null,
    next_action_date: normalizeSalesDate(input.next_action_date),
    estimated_revenue: normalizeSalesNumber(input.estimated_revenue),
    actual_revenue: normalizeSalesNumber(input.actual_revenue),
    currency: normalizeSalesText(input.currency, 8) || "ILS",
    status: isSalesStatus(input.status) ? input.status : "open",
    source: isSalesSource(input.source) ? input.source : "manual",
    linked_bina_invoice_no: normalizeSalesInteger(input.linked_bina_invoice_no),
    linked_bina_order_no: normalizeSalesInteger(input.linked_bina_order_no),
    linked_bina_delivery_no: normalizeSalesInteger(input.linked_bina_delivery_no),
    ai_confidence: input.ai_confidence ?? null,
    metadata: input.metadata ?? {},
  };
}

export async function fetchSalesActivities(params: SalesListParams = {}) {
  const supabase = createServiceSupabase();
  const limit = clampLimit(params.limit);
  const offset = Math.max(0, Number(params.offset ?? 0));
  const pattern = likePattern(params.search);

  let query = supabase
    .from("sales_activity_logs")
    .select("*", { count: "exact" })
    .order("event_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.dateFrom) query = query.gte("event_at", params.dateFrom);
  if (params.dateTo) query = query.lte("event_at", params.dateTo);
  if (params.nextActionFrom) query = query.gte("next_action_date", params.nextActionFrom);
  if (params.nextActionTo) query = query.lte("next_action_date", params.nextActionTo);
  if (params.salesperson) query = query.ilike("salesperson", likePattern(params.salesperson) ?? "%");
  if (params.eventType && isSalesEventType(params.eventType)) query = query.eq("event_type", params.eventType);
  if (params.status && isSalesStatus(params.status)) query = query.eq("status", params.status);
  if (pattern) {
    query = query.or([
      `customer_name.ilike.${pattern}`,
      `salesperson.ilike.${pattern}`,
      `raw_note.ilike.${pattern}`,
      `ai_summary.ilike.${pattern}`,
      `ai_next_action.ilike.${pattern}`,
    ].join(","));
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as SalesActivityLog[], count: count ?? 0 };
}

export async function createSalesActivity(input: SalesActivityInput) {
  const supabase = createServiceSupabase();
  const payload = cleanActivityInput(input);
  const { data, error } = await supabase
    .from("sales_activity_logs")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as SalesActivityLog;
}

export async function updateSalesActivity(id: string, input: Partial<SalesActivityInput>) {
  const supabase = createServiceSupabase();
  const patch: Record<string, unknown> = {};
  const errors = validateSalesActivityPatch(input);
  if (errors.length > 0) throw new SalesValidationError(errors[0]);

  if (input.event_type !== undefined) {
    if (!isSalesEventType(input.event_type)) throw new Error("INVALID_EVENT_TYPE");
    patch.event_type = input.event_type;
  }
  if (input.event_at !== undefined) patch.event_at = normalizeSalesDateTime(input.event_at);
  if (input.salesperson !== undefined) patch.salesperson = normalizeSalesText(input.salesperson, 120);
  if (input.customer_name !== undefined) patch.customer_name = normalizeSalesText(input.customer_name, 200);
  if (input.customer_code !== undefined) patch.customer_code = normalizeSalesInteger(input.customer_code);
  if (input.contact_person !== undefined) patch.contact_person = normalizeSalesText(input.contact_person, 120) || null;
  if (input.raw_note !== undefined) patch.raw_note = normalizeSalesText(input.raw_note, 8000);
  if (input.ai_summary !== undefined) patch.ai_summary = normalizeSalesText(input.ai_summary, 4000) || null;
  if (input.ai_next_action !== undefined) patch.ai_next_action = normalizeSalesText(input.ai_next_action, 1000) || null;
  if (input.next_action_date !== undefined) patch.next_action_date = normalizeSalesDate(input.next_action_date);
  if (input.estimated_revenue !== undefined) patch.estimated_revenue = normalizeSalesNumber(input.estimated_revenue);
  if (input.actual_revenue !== undefined) patch.actual_revenue = normalizeSalesNumber(input.actual_revenue);
  if (input.currency !== undefined) patch.currency = normalizeSalesText(input.currency, 8) || "ILS";
  if (input.status !== undefined) patch.status = input.status;
  if (input.source !== undefined) {
    patch.source = input.source;
  }
  if (input.linked_bina_invoice_no !== undefined) patch.linked_bina_invoice_no = normalizeSalesInteger(input.linked_bina_invoice_no);
  if (input.linked_bina_order_no !== undefined) patch.linked_bina_order_no = normalizeSalesInteger(input.linked_bina_order_no);
  if (input.linked_bina_delivery_no !== undefined) patch.linked_bina_delivery_no = normalizeSalesInteger(input.linked_bina_delivery_no);
  if (input.ai_confidence !== undefined) patch.ai_confidence = input.ai_confidence;
  if (input.metadata !== undefined) patch.metadata = input.metadata ?? {};

  if (Object.keys(patch).length === 0) throw new SalesValidationError("EMPTY_PATCH");

  const { data, error } = await supabase
    .from("sales_activity_logs")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as SalesActivityLog;
}

export async function fetchSalesClients(params: { search?: string | null; limit?: number | null } = {}) {
  const supabase = createServiceSupabase();
  const limit = clampLimit(params.limit ?? 20);
  const pattern = likePattern(params.search);

  let query = supabase
    .from("mart_sales_client_activity")
    .select("*")
    .order("combined_score", { ascending: false })
    .limit(limit);

  if (pattern) {
    query = query.or(`customer_name.ilike.${pattern},salesperson.ilike.${pattern}`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as SalesClientActivity[] };
}

export async function fetchSalesSummary(): Promise<SalesSummary> {
  const supabase = createServiceSupabase();
  const month = startOfMonth().toISOString();

  const [
    dashboardResult,
    monthBinaSalesResult,
    topClientsResult,
  ] = await Promise.all([
    supabase.from("mart_sales_dashboard_summary").select("*").single(),
    supabase.from("mart_bina_sales_status").select("bina_id,invoice_no,customer_name,invoice_at,total_amount,salesperson").gte("invoice_at", month).order("invoice_at", { ascending: false }).limit(200),
    supabase.from("mart_sales_client_activity").select("*").order("combined_score", { ascending: false }).limit(8),
  ]);

  for (const result of [dashboardResult, monthBinaSalesResult, topClientsResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const monthBinaSales = monthBinaSalesResult.data ?? [];
  const dashboard = dashboardResult.data as {
    today_count?: number | null;
    week_count?: number | null;
    open_followups?: number | null;
    overdue_followups?: number | null;
    estimated_pipeline?: number | null;
    actual_logged_revenue?: number | null;
    bina_month_revenue?: number | null;
  } | null;

  return {
    todayCount: Number(dashboard?.today_count ?? 0),
    weekCount: Number(dashboard?.week_count ?? 0),
    openFollowUps: Number(dashboard?.open_followups ?? 0),
    overdueFollowUps: Number(dashboard?.overdue_followups ?? 0),
    estimatedPipeline: Number(dashboard?.estimated_pipeline ?? 0),
    actualLoggedRevenue: Number(dashboard?.actual_logged_revenue ?? 0),
    binaMonthRevenue: Number(dashboard?.bina_month_revenue ?? 0),
    topClients: (topClientsResult.data ?? []) as SalesClientActivity[],
    recentBinaSales: monthBinaSales as SalesSummary["recentBinaSales"],
  };
}
