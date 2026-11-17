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
import {
  buildFilteredSalesAnalytics,
  type SalesAnalyticsActivityRow,
  type SalesIcpSegment,
} from "@/lib/data/sales-analytics";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export type SalesActivityLog = {
  id: string;
  sales_user_id: string | null;
  event_type: SalesEventType;
  event_at: string;
  salesperson: string;
  customer_name: string;
  customer_code: number | null;
  local_client_id: string | null;
  contact_person: string | null;
  contact_occurred: boolean | null;
  raw_note: string;
  ai_summary: string | null;
  ai_next_action: string | null;
  next_action_date: string | null;
  estimated_revenue: number | null;
  actual_revenue: number | null;
  currency: string;
  status: SalesStatus;
  source: SalesSource;
  portal_submitted_at: string | null;
  linked_bina_invoice_no: number | null;
  linked_bina_order_no: number | null;
  linked_bina_delivery_no: number | null;
  ai_confidence: "low" | "medium" | "high" | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  attachments?: SalesActivityAttachment[];
};

export type SalesActivityAttachment = {
  id: string;
  sales_activity_id: string;
  sales_user_id: string | null;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_bucket: string;
  storage_path: string;
  public_url: string;
  created_at: string;
};

export type SalesClientActivity = {
  local_client_id: string | null;
  customer_code: number | null;
  customer_name: string;
  invoice_count: number;
  invoice_revenue: number;
  last_invoice_at: string | null;
  activity_count: number;
  estimated_pipeline: number;
  last_activity_at: string | null;
  salesperson: string | null;
  customer_group: string | null;
  customer_status: string | null;
  bookkeeping_no: string | null;
  contact_person: string | null;
  opened_at: string | null;
  name_source: "bina_index" | "local_pending" | "manual_activity" | "bina";
  combined_score: number;
};

export type BinaClientIndexRow = {
  client_ref: string;
  local_client_id: string | null;
  customer_code: number | null;
  customer_code_text: string | null;
  customer_name: string;
  customer_group: string | null;
  status: string | null;
  area: string | null;
  bookkeeping_no: string | null;
  tax_id: string | null;
  contact_person: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  salesperson: string | null;
  opened_at: string | null;
  source_filename: string;
  source_updated_at: string | null;
  imported_at: string;
  source: "bina_index" | "local_pending";
  sync_status: "pending" | "ready" | "synced" | "failed" | "rejected";
};

export type SalesClientProfile = {
  client: BinaClientIndexRow;
  ownership: {
    accountManager: string | null;
    source: "bina_master" | "approved_local" | "missing";
    confidence: "exact" | "inferred" | "missing_data";
  };
  touch: {
    lastHumanContactAt: string | null;
    dormancyBucket: "active" | "attention" | "dormant" | "unknown";
    daysSinceContact: number | null;
    wording: string;
    confidence: "inferred" | "missing_data";
  };
  coverage: {
    gestelitActivities: "complete_for_visible_scope";
    binaClientMaster: "indexed" | "local_pending";
    binaCrmHistory: "not_connected";
    binaCommercialHistory: "partial_sync";
    visibleScope: "personal" | "team";
  };
  activities: {
    rows: SalesActivityLog[];
    count: number;
    limit: number;
    offset: number;
  };
  invoices: Array<{
    bina_id: string;
    invoice_no: number | null;
    invoice_at: string | null;
    due_at: string | null;
    total_amount: number | null;
    salesperson: string | null;
    synced_at: string | null;
  }>;
  deliveries: Array<{
    bina_id: string;
    delivery_no: number | null;
    delivery_at: string | null;
    sent_at: string | null;
    delivery_state: string | null;
    tracking_no: string | null;
    total_amount: number | null;
    synced_at: string | null;
  }>;
};

export type SalesDormantClient = {
  client_ref: string;
  local_client_id: string | null;
  customer_code: number | null;
  customer_name: string;
  customer_group: string | null;
  area: string | null;
  account_manager: string | null;
  account_manager_sales_user_id: string | null;
  last_human_contact_at: string | null;
  days_since_last_human_contact: number | null;
  dormancy_bucket: "attention" | "dormant" | "unknown" | "active";
  dormancy_label: string;
  next_action_date: string | null;
  contact_coverage_scope: "gestelit_only";
  data_freshness_at: string | null;
};

export type SalesPortfolioClient = SalesDormantClient & {
  last_commercial_activity_at: string | null;
  last_invoice_at: string | null;
  current_invoice_row_count: number;
  activity_count: number;
  contact_confidence: "exact" | "inferred" | "missing_data";
  coverage_note: string;
};

export type SalesSummary = {
  todayCount: number;
  weekCount: number;
  openFollowUps: number;
  overdueFollowUps: number;
  estimatedPipeline: number;
  actualLoggedRevenue: number;
  headlineCurrency: string;
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
  analytics: {
    periodDays: number;
    filteredCount: number;
    isTruncated: boolean;
    funnel: {
      open: number;
      won: number;
      lost: number;
      winRate: number;
    };
    eventMix: Array<{
      eventType: SalesEventType;
      activityCount: number;
      uniqueClients: number;
      wonCount: number;
    }>;
    daily: Array<{
      date: string;
      currency: string;
      activityCount: number;
      uniqueClients: number;
      wonCount: number;
      lostCount: number;
      estimatedPipeline: number;
      wonRevenue: number;
    }>;
    currencies: Array<{
      currency: string;
      estimatedPipeline: number;
      wonRevenue: number;
      wonCount: number;
      openCount: number;
    }>;
    reps: Array<{
      salesperson: string;
      currency: string;
      activityCount: number;
      uniqueClients: number;
      wonCount: number;
      lostCount: number;
      openCount: number;
      overdueFollowUps: number;
      estimatedPipeline: number;
      wonRevenue: number;
      conversionRate: number;
      lastActivityAt: string | null;
    }>;
    icpSegments: SalesIcpSegment[];
    opportunities: Array<{
      clientKey: string;
      customerName: string;
      customerCode: number | null;
      localClientId: string | null;
      salesperson: string;
      currency: string;
      activityCount: number;
      estimatedPipeline: number;
      overdueFollowUps: number;
      nextActionDate: string | null;
      lastActivityAt: string | null;
      latestContext: string | null;
      customerGroup: string;
      area: string;
      inactiveDays: number;
      priorityScore: number;
    }>;
    dataQuality: {
      total: number;
      clientLinkRate: number;
      valueCaptureRate: number;
      contactCaptureRate: number;
      nextActionRate: number;
      outcomeClosureRate: number;
      lostOutcomeCount: number;
    };
  };
};

export type SalesListParams = {
  search?: string | null;
  limit?: number | null;
  offset?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  salesperson?: string | null;
  client?: string | null;
  eventType?: string | null;
  status?: string | null;
  nextActionFrom?: string | null;
  nextActionTo?: string | null;
  accountManager?: string | null;
  customerGroup?: string | null;
  area?: string | null;
  dormancyBucket?: string | null;
  coverage?: string | null;
};

type SalesDashboardAggregate = {
  currency_code: string;
  activity_count: number;
  unique_client_count: number;
  open_count: number;
  won_count: number;
  lost_count: number;
  meeting_count: number;
  call_count: number;
  lead_count: number;
  sale_count: number;
  follow_up_count: number;
  open_follow_up_count: number;
  overdue_follow_up_count: number;
  estimated_pipeline: number;
  won_revenue: number;
  coverage_scope: string;
  is_complete_contact_history: boolean;
  freshness_at: string | null;
};

export function selectSalesHeadlineCurrency(rows: SalesDashboardAggregate[]) {
  return rows.find((row) => row.currency_code === "ILS")
    ?? (rows.length === 1 ? rows[0] : undefined);
}

export type SalesReportActivityRow = SalesAnalyticsActivityRow & {
  id: string;
  sales_user_id: string | null;
  contact_occurred: boolean | null;
  source: SalesSource;
  created_at: string;
  updated_at: string;
};

export type SalesReportData = {
  generatedAt: string;
  dateFrom: string;
  dateTo: string;
  rows: SalesReportActivityRow[];
  summary: SalesSummary;
};

export type SalesActivityInput = {
  event_type: SalesEventType;
  event_at?: string | null;
  salesperson: string;
  customer_name: string;
  customer_code?: number | null;
  local_client_id?: string | null;
  contact_person?: string | null;
  contact_occurred?: boolean | null;
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
  sales_user_id?: string | null;
  portal_submitted_at?: string | null;
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
    local_client_id: typeof input.local_client_id === "string" && input.local_client_id ? input.local_client_id : null,
    contact_person: normalizeSalesText(input.contact_person, 120) || null,
    contact_occurred: typeof input.contact_occurred === "boolean" ? input.contact_occurred : null,
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
    sales_user_id: typeof input.sales_user_id === "string" && input.sales_user_id ? input.sales_user_id : null,
    portal_submitted_at: typeof input.portal_submitted_at === "string" && input.portal_submitted_at ? input.portal_submitted_at : null,
  };
}

async function attachSalesAttachments(rows: SalesActivityLog[]) {
  if (rows.length === 0) return rows;
  const supabase = createServiceSupabase();
  const ids = rows.map((row) => row.id);
  const { data, error } = await supabase
    .from("sales_activity_attachments")
    .select("*")
    .in("sales_activity_id", ids)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  const byActivity = new Map<string, SalesActivityAttachment[]>();
  for (const attachment of (data ?? []) as SalesActivityAttachment[]) {
    const bucket = byActivity.get(attachment.sales_activity_id) ?? [];
    bucket.push({
      ...attachment,
      public_url: `/api/sales/attachments/${encodeURIComponent(attachment.id)}`,
    });
    byActivity.set(attachment.sales_activity_id, bucket);
  }

  return rows.map((row) => ({
    ...row,
    attachments: byActivity.get(row.id) ?? [],
  }));
}

export async function fetchSalesActivities(params: SalesListParams = {}) {
  const supabase = createServiceSupabase();
  const limit = clampLimit(params.limit);
  const offset = Math.max(0, Number(params.offset ?? 0));
  const pattern = likePattern(params.search);

  let query = supabase
    .from("mart_sales_activity_scoped")
    .select("*", { count: "exact" })
    .order("event_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.dateFrom) query = query.gte("event_at", params.dateFrom);
  if (params.dateTo) query = query.lte("event_at", params.dateTo);
  if (params.nextActionFrom) query = query.gte("next_action_date", params.nextActionFrom);
  if (params.nextActionTo) query = query.lte("next_action_date", params.nextActionTo);
  if (params.salesperson) query = query.ilike("salesperson", likePattern(params.salesperson) ?? "%");
  if (params.client) {
    const clientPattern = likePattern(params.client);
    const customerCode = normalizeSalesInteger(params.client);
    if (clientPattern) {
      query = query.or([
        `customer_name.ilike.${clientPattern}`,
        ...(customerCode == null ? [] : [`customer_code.eq.${customerCode}`]),
      ].join(","));
    }
  }
  if (params.eventType && isSalesEventType(params.eventType)) query = query.eq("event_type", params.eventType);
  if (params.status && isSalesStatus(params.status)) query = query.eq("status", params.status);
  if (params.accountManager) query = query.ilike("account_manager", likePattern(params.accountManager) ?? "%");
  if (params.customerGroup) query = query.eq("customer_group", params.customerGroup);
  if (params.area) query = query.eq("area", params.area);
  if (params.dormancyBucket) query = query.eq("dormancy_bucket", params.dormancyBucket);
  if (params.coverage) query = query.eq("coverage_scope", params.coverage);
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
  return { rows: await attachSalesAttachments((data ?? []) as SalesActivityLog[]), count: count ?? 0 };
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
  const [activity] = await attachSalesAttachments([data as SalesActivityLog]);
  return activity;
}

export async function updateSalesActivity(
  id: string,
  input: Partial<SalesActivityInput>,
  actorSalesUserId?: string,
) {
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
  if (input.local_client_id !== undefined) patch.local_client_id = input.local_client_id || null;
  if (input.contact_person !== undefined) patch.contact_person = normalizeSalesText(input.contact_person, 120) || null;
  if (input.contact_occurred !== undefined) {
    patch.contact_occurred = typeof input.contact_occurred === "boolean" ? input.contact_occurred : null;
  }
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
  if (actorSalesUserId) patch.last_edited_by_sales_user_id = actorSalesUserId;

  if (Object.keys(patch).length === 0) throw new SalesValidationError("EMPTY_PATCH");

  const { data, error } = await supabase
    .from("sales_activity_logs")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  const [activity] = await attachSalesAttachments([data as SalesActivityLog]);
  return activity;
}

export async function fetchSalesUserActivities(
  salesUserId: string,
  params: Omit<SalesListParams, "salesperson"> = {},
) {
  const supabase = createServiceSupabase();
  const limit = clampLimit(params.limit);
  const offset = Math.max(0, Number(params.offset ?? 0));
  const pattern = likePattern(params.search);

  let query = supabase
    .from("sales_activity_logs")
    .select("*", { count: "exact" })
    .eq("sales_user_id", salesUserId)
    .order("event_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.dateFrom) query = query.gte("event_at", params.dateFrom);
  if (params.dateTo) query = query.lte("event_at", params.dateTo);
  if (params.nextActionFrom) query = query.gte("next_action_date", params.nextActionFrom);
  if (params.nextActionTo) query = query.lte("next_action_date", params.nextActionTo);
  if (params.eventType && isSalesEventType(params.eventType)) query = query.eq("event_type", params.eventType);
  if (params.status && isSalesStatus(params.status)) query = query.eq("status", params.status);
  if (pattern) {
    query = query.or([
      `customer_name.ilike.${pattern}`,
      `contact_person.ilike.${pattern}`,
      `raw_note.ilike.${pattern}`,
      `ai_summary.ilike.${pattern}`,
      `ai_next_action.ilike.${pattern}`,
    ].join(","));
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { rows: await attachSalesAttachments((data ?? []) as SalesActivityLog[]), count: count ?? 0 };
}

export async function createSalesActivityForUser(
  salesUser: { id: string; full_name: string },
  input: Omit<SalesActivityInput, "salesperson" | "sales_user_id" | "portal_submitted_at">,
) {
  return createSalesActivity({
    ...input,
    salesperson: salesUser.full_name,
    sales_user_id: salesUser.id,
    portal_submitted_at: new Date().toISOString(),
    metadata: {
      ...(input.metadata ?? {}),
      submittedBy: "sales_portal",
    },
  });
}

export async function updateSalesActivityForUser(
  salesUserId: string,
  id: string,
  input: Partial<SalesActivityInput>,
) {
  const supabase = createServiceSupabase();
  const { data: existing, error: existingError } = await supabase
    .from("sales_activity_logs")
    .select("id")
    .eq("id", id)
    .eq("sales_user_id", salesUserId)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (!existing) throw new Error("SALES_ACTIVITY_NOT_FOUND");
  return updateSalesActivity(id, input, salesUserId);
}

export async function createSalesActivityAttachment(input: {
  salesActivityId: string;
  salesUserId: string | null;
  fileName: string;
  fileType: string;
  fileSize: number;
  storageBucket: string;
  storagePath: string;
  publicUrl: string;
}) {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("sales_activity_attachments")
    .insert({
      sales_activity_id: input.salesActivityId,
      sales_user_id: input.salesUserId,
      file_name: input.fileName,
      file_type: input.fileType,
      file_size: input.fileSize,
      storage_bucket: input.storageBucket,
      storage_path: input.storagePath,
      public_url: input.publicUrl,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return {
    ...(data as SalesActivityAttachment),
    public_url: `/api/sales/attachments/${encodeURIComponent(data.id)}`,
  };
}

export async function fetchSalesUserClients(
  salesUserId: string,
  params: { search?: string | null; limit?: number | null } = {},
) {
  const supabase = createServiceSupabase();
  const limit = clampLimit(params.limit ?? 12);
  const pattern = likePattern(params.search);

  const ownQuery = supabase.rpc("get_sales_user_clients", {
    p_sales_user_id: salesUserId,
    p_search: params.search?.trim() || null,
    p_limit: limit,
  });

  const suggestedQuery = pattern
    ? supabase.rpc("search_sales_client_activity_scoped", {
      p_search: params.search?.trim() ?? "",
      p_limit: limit,
    })
    : supabase
      .from("mart_sales_client_activity_scoped")
      .select("*")
      .order("combined_score", { ascending: false })
      .limit(limit);

  const [ownResult, initialSuggestedResult] = await Promise.all([ownQuery, suggestedQuery]);
  if (ownResult.error) throw new Error(ownResult.error.message);
  let suggestedResult = initialSuggestedResult;
  if (
    pattern
    && suggestedResult.error
    && ["PGRST202", "42883"].includes(suggestedResult.error.code ?? "")
  ) {
    suggestedResult = await supabase
      .from("mart_sales_client_activity_scoped")
      .select("*")
      .or(`customer_name.ilike.${pattern},salesperson.ilike.${pattern}`)
      .order("combined_score", { ascending: false })
      .limit(limit);
  }
  if (suggestedResult.error) throw new Error(suggestedResult.error.message);

  const cleanSuggestedClients = ((suggestedResult.data ?? []) as SalesClientActivity[])
    .filter((client) => !/[?]{2,}/.test(String(client.customer_name ?? "")))
    .slice(0, limit);

  return {
    ownClients: ((ownResult.data ?? []) as Array<Record<string, unknown>>).map((client) => ({
      ...client,
      activity_count: Number(client.activity_count ?? 0),
      estimated_pipeline: Number(client.estimated_pipeline ?? 0),
      actual_revenue: Number(client.actual_revenue ?? 0),
    })),
    suggestedClients: cleanSuggestedClients,
  };
}

export async function fetchSalesUserSummary(salesUserId: string) {
  const supabase = createServiceSupabase();
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  const week = new Date(day);
  week.setDate(week.getDate() - week.getDay());

  const { data, error } = await supabase
    .from("sales_activity_logs")
    .select("id,event_at,status,estimated_revenue,actual_revenue,currency,next_action_date")
    .eq("sales_user_id", salesUserId)
    .gte("event_at", week.toISOString());

  if (error) throw new Error(error.message);
  const todayIso = new Date().toISOString().slice(0, 10);
  const rows = data ?? [];
  const currencyTotals = new Map<string, { estimated: number; actual: number }>();
  for (const row of rows) {
    const currency = String(row.currency || "ILS").toUpperCase();
    const current = currencyTotals.get(currency) ?? { estimated: 0, actual: 0 };
    current.estimated += Number(row.estimated_revenue ?? 0);
    current.actual += Number(row.actual_revenue ?? 0);
    currencyTotals.set(currency, current);
  }
  const headlineCurrency = currencyTotals.has("ILS")
    ? "ILS"
    : [...currencyTotals.entries()].sort((left, right) => (
      right[1].estimated + right[1].actual - left[1].estimated - left[1].actual
    ))[0]?.[0] ?? "ILS";
  const headlineTotals = currencyTotals.get(headlineCurrency) ?? { estimated: 0, actual: 0 };
  return {
    todayCount: rows.filter((row) => new Date(row.event_at) >= day).length,
    weekCount: rows.length,
    openFollowUps: rows.filter((row) => row.status === "follow_up").length,
    overdueFollowUps: rows.filter((row) => row.status === "follow_up" && row.next_action_date && row.next_action_date <= todayIso).length,
    estimatedPipeline: headlineTotals.estimated,
    actualRevenue: headlineTotals.actual,
    headlineCurrency,
  };
}

export async function fetchSalesClients(params: { search?: string | null; limit?: number | null } = {}) {
  const supabase = createServiceSupabase();
  const limit = clampLimit(params.limit ?? 20);
  const pattern = likePattern(params.search);

  let query = supabase
    .from("mart_sales_client_activity_scoped")
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

export async function fetchBinaClientIndex(params: {
  search?: string | null;
  salesUserId?: string | null;
  limit?: number | null;
  offset?: number | null;
} = {}) {
  const supabase = createServiceSupabase();
  const limit = clampLimit(params.limit ?? 30);
  const offset = Math.max(0, Number(params.offset ?? 0));
  const pattern = likePattern(params.search);
  let query = supabase
    .from("mart_sales_client_profile")
    .select("client_ref,local_client_id,customer_code,customer_name,customer_group,customer_status,area,bookkeeping_no,tax_id,contact_person,phone,mobile,email,account_manager,opened_at,directory_source,data_freshness_at,account_manager_sales_user_id", { count: "exact" })
    .order("customer_name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (pattern) {
    query = query.or([
      `customer_code.eq.${normalizeSalesInteger(params.search) ?? -1}`,
      `customer_name.ilike.${pattern}`,
      `customer_group.ilike.${pattern}`,
      `bookkeeping_no.ilike.${pattern}`,
      `account_manager.ilike.${pattern}`,
    ].join(","));
  }
  if (params.salesUserId) query = query.eq("account_manager_sales_user_id", params.salesUserId);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return {
    rows: (data ?? []).map((row) => ({
      client_ref: row.client_ref,
      local_client_id: row.local_client_id,
      customer_code: row.customer_code,
      customer_code_text: row.customer_code == null ? null : String(row.customer_code),
      customer_name: row.customer_name,
      customer_group: row.customer_group,
      status: row.customer_status,
      area: row.area,
      bookkeeping_no: row.bookkeeping_no,
      tax_id: row.tax_id,
      contact_person: row.contact_person,
      phone: row.phone,
      mobile: row.mobile,
      email: row.email,
      salesperson: row.account_manager,
      opened_at: row.opened_at,
      source_filename: "",
      source_updated_at: row.data_freshness_at,
      imported_at: row.data_freshness_at ?? new Date(0).toISOString(),
      source: row.directory_source === "approved_local" ? "local_pending" : "bina_index",
      sync_status: row.directory_source === "approved_local" ? "pending" : "synced",
    })) as BinaClientIndexRow[],
    count: count ?? 0,
  };
}

function applyClientIdentityFilter<T extends {
  eq(column: string, value: string | number): T;
}>(query: T, client: BinaClientIndexRow): T {
  if (client.local_client_id) return query.eq("local_client_id", client.local_client_id);
  if (client.customer_code != null) return query.eq("customer_code", client.customer_code);
  return query.eq("customer_name", client.customer_name);
}

function clientTouchState(lastHumanContactAt: string | null) {
  if (!lastHumanContactAt) {
    return {
      lastHumanContactAt: null,
      dormancyBucket: "unknown" as const,
      daysSinceContact: null,
      wording: "אין עדיין היסטוריית פניות מלאה. נתוני BINA ההיסטוריים טרם חוברו.",
      confidence: "missing_data" as const,
    };
  }
  const daysSinceContact = Math.max(
    0,
    Math.floor((Date.now() - new Date(lastHumanContactAt).getTime()) / 86_400_000),
  );
  const dormancyBucket = daysSinceContact >= 180
    ? "dormant" as const
    : daysSinceContact >= 90
      ? "attention" as const
      : "active" as const;
  return {
    lastHumanContactAt,
    dormancyBucket,
    daysSinceContact,
    wording: daysSinceContact >= 180
      ? "לא תועדה פנייה בגסטליט ב-6 החודשים האחרונים"
      : daysSinceContact >= 90
        ? "לא תועדה פנייה בגסטליט ב-3 החודשים האחרונים"
        : "תועדה פנייה בגסטליט ב-90 הימים האחרונים",
    confidence: "inferred" as const,
  };
}

export async function fetchSalesClientProfile(input: {
  clientRef: string;
  salesUserId: string;
  canViewTeam: boolean;
  limit?: number | null;
  offset?: number | null;
}): Promise<SalesClientProfile> {
  const supabase = createServiceSupabase();
  const limit = clampLimit(input.limit ?? 30);
  const offset = Math.max(0, Number(input.offset ?? 0));

  const { data: clientData, error: clientError } = await supabase
    .from("mart_sales_client_directory")
    .select("client_ref,local_client_id,customer_code,customer_code_text,customer_name,customer_group,status,area,bookkeeping_no,tax_id,contact_person,phone,mobile,email,salesperson,opened_at,source,sync_status,source_filename,source_updated_at,imported_at")
    .eq("client_ref", input.clientRef)
    .maybeSingle();

  if (clientError) throw new Error(clientError.message);
  if (!clientData) throw new Error("SALES_CLIENT_NOT_FOUND");
  const client = clientData as BinaClientIndexRow;

  const { data: canonicalProfile, error: canonicalError } = await supabase
    .from("mart_sales_client_profile")
    .select("account_manager,account_manager_sales_user_id,ownership_source,ownership_confidence")
    .eq("client_ref", input.clientRef)
    .maybeSingle();
  if (canonicalError) throw new Error(canonicalError.message);

  const isOwner = canonicalProfile?.account_manager_sales_user_id === input.salesUserId;
  if (!input.canViewTeam && !isOwner) {
    let visibilityQuery = supabase
      .from("sales_activity_logs")
      .select("id")
      .eq("sales_user_id", input.salesUserId)
      .limit(1);
    visibilityQuery = applyClientIdentityFilter(visibilityQuery, client);
    const visibility = await visibilityQuery;
    if (visibility.error) throw new Error(visibility.error.message);
    if (!visibility.data?.length) throw new Error("SALES_CLIENT_FORBIDDEN");
  }

  let activityQuery = supabase
    .from("sales_activity_logs")
    .select("*", { count: "exact" })
    .order("event_at", { ascending: false })
    .range(offset, offset + limit - 1);
  activityQuery = applyClientIdentityFilter(activityQuery, client);
  if (!input.canViewTeam) activityQuery = activityQuery.eq("sales_user_id", input.salesUserId);

  let latestTouchQuery = supabase
    .from("sales_activity_logs")
    .select("event_at")
    .or("contact_occurred.eq.true,and(contact_occurred.is.null,event_type.in.(meeting,call,follow_up,sale))")
    .order("event_at", { ascending: false })
    .limit(1);
  latestTouchQuery = applyClientIdentityFilter(latestTouchQuery, client);
  if (!input.canViewTeam) latestTouchQuery = latestTouchQuery.eq("sales_user_id", input.salesUserId);

  let invoiceQuery = supabase
    .from("mart_bina_sales_status")
    .select("bina_id,invoice_no,invoice_at,due_at,total_amount,salesperson,synced_at")
    .order("invoice_at", { ascending: false })
    .limit(25);
  invoiceQuery = client.customer_code != null
    ? invoiceQuery.eq("customer_code", client.customer_code)
    : invoiceQuery.eq("customer_name", client.customer_name);

  let deliveryQuery = supabase
    .from("mart_bina_delivery_status")
    .select("bina_id,delivery_no,delivery_at,sent_at,delivery_state,tracking_no,total_amount,synced_at")
    .order("delivery_at", { ascending: false })
    .limit(25);
  deliveryQuery = client.customer_code != null
    ? deliveryQuery.eq("customer_code", client.customer_code)
    : deliveryQuery.eq("customer_name", client.customer_name);

  const [activitiesResult, touchResult, invoiceResult, deliveryResult] = await Promise.all([
    activityQuery,
    latestTouchQuery,
    invoiceQuery,
    deliveryQuery,
  ]);
  if (activitiesResult.error) throw new Error(activitiesResult.error.message);
  if (touchResult.error) throw new Error(touchResult.error.message);
  if (invoiceResult.error) throw new Error(invoiceResult.error.message);
  if (deliveryResult.error) throw new Error(deliveryResult.error.message);

  const fallbackSource = client.source === "bina_index" ? "bina_master" as const : "approved_local" as const;
  const accountManager = canonicalProfile?.account_manager ?? client.salesperson;
  const ownershipSource = canonicalProfile?.ownership_source === "approved_local"
    ? "approved_local" as const
    : canonicalProfile?.ownership_source === "missing"
      ? "missing" as const
      : canonicalProfile?.ownership_source
        ? "bina_master" as const
        : accountManager
          ? fallbackSource
          : "missing" as const;
  const ownershipConfidence = canonicalProfile?.ownership_confidence === "exact"
    ? "exact" as const
    : canonicalProfile?.ownership_confidence === "inferred"
      ? "inferred" as const
      : accountManager
        ? "inferred" as const
        : "missing_data" as const;
  return {
    client,
    ownership: {
      accountManager,
      source: ownershipSource,
      confidence: ownershipConfidence,
    },
    touch: clientTouchState(touchResult.data?.[0]?.event_at ?? null),
    coverage: {
      gestelitActivities: "complete_for_visible_scope",
      binaClientMaster: client.source === "bina_index" ? "indexed" : "local_pending",
      binaCrmHistory: "not_connected",
      binaCommercialHistory: "partial_sync",
      visibleScope: input.canViewTeam ? "team" : "personal",
    },
    activities: {
      rows: await attachSalesAttachments((activitiesResult.data ?? []) as SalesActivityLog[]),
      count: activitiesResult.count ?? 0,
      limit,
      offset,
    },
    invoices: (invoiceResult.data ?? []) as SalesClientProfile["invoices"],
    deliveries: (deliveryResult.data ?? []) as SalesClientProfile["deliveries"],
  };
}

export async function fetchSalesDormantClients(input: {
  salesUserId: string;
  salesperson: string;
  bucket?: "attention" | "dormant" | "unknown" | null;
  limit?: number | null;
  offset?: number | null;
}) {
  const supabase = createServiceSupabase();
  const limit = clampLimit(input.limit ?? 100);
  const offset = Math.max(0, Number(input.offset ?? 0));

  let query = supabase
    .from("mart_sales_client_dormancy")
    .select("client_ref,local_client_id,customer_code,customer_name,customer_group,area,account_manager,account_manager_sales_user_id,last_human_contact_at,days_since_last_human_contact,dormancy_bucket,dormancy_label,next_action_date,contact_coverage_scope,data_freshness_at", { count: "exact" })
    .eq("account_manager_sales_user_id", input.salesUserId)
    .order("days_since_last_human_contact", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);
  if (input.bucket) query = query.eq("dormancy_bucket", input.bucket);
  let result = await query;

  // Some imported BINA owner names cannot yet be reconciled to a portal UUID.
  // Exact-name fallback preserves the personal queue without broadening scope.
  if (!result.error && (result.count ?? 0) === 0 && input.salesperson.trim()) {
    let fallback = supabase
      .from("mart_sales_client_dormancy")
      .select("client_ref,local_client_id,customer_code,customer_name,customer_group,area,account_manager,account_manager_sales_user_id,last_human_contact_at,days_since_last_human_contact,dormancy_bucket,dormancy_label,next_action_date,contact_coverage_scope,data_freshness_at", { count: "exact" })
      .eq("account_manager", input.salesperson.trim())
      .order("days_since_last_human_contact", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);
    if (input.bucket) fallback = fallback.eq("dormancy_bucket", input.bucket);
    result = await fallback;
  }

  if (result.error) throw new Error(result.error.message);
  return {
    rows: (result.data ?? []) as SalesDormantClient[],
    count: result.count ?? 0,
    coverage: "gestelit_only" as const,
    wording: "לא תועדה פנייה בגסטליט בתקופה שנבחרה. היסטוריית CRM מ-BINA עדיין לא מחוברת.",
  };
}

export async function fetchSalesPortfolioClients(input: {
  salesUserId: string;
  salesperson: string;
  search?: string | null;
  limit?: number | null;
  offset?: number | null;
}) {
  const supabase = createServiceSupabase();
  const limit = clampLimit(input.limit ?? 12);
  const offset = Math.max(0, Number(input.offset ?? 0));
  const columns = "client_ref,local_client_id,customer_code,customer_name,customer_group,area,account_manager,account_manager_sales_user_id,last_human_contact_at,days_since_last_human_contact,dormancy_bucket,dormancy_label,next_action_date,contact_coverage_scope,data_freshness_at,last_commercial_activity_at,last_invoice_at,current_invoice_row_count,activity_count,contact_confidence,coverage_note";
  const pattern = likePattern(input.search);

  const buildQuery = (byName = false) => {
    let query = supabase
      .from("mart_sales_personal_portfolio")
      .select(columns, { count: "exact" })
      .order("next_action_date", { ascending: true, nullsFirst: false })
      .order("days_since_last_human_contact", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);
    query = byName
      ? query.eq("account_manager", input.salesperson.trim())
      : query.eq("account_manager_sales_user_id", input.salesUserId);
    if (pattern) {
      query = query.or(`customer_name.ilike.${pattern},customer_code.eq.${normalizeSalesInteger(input.search) ?? -1}`);
    }
    return query;
  };

  let result = await buildQuery(false);
  if (!result.error && (result.count ?? 0) === 0 && input.salesperson.trim()) {
    result = await buildQuery(true);
  }
  if (result.error) throw new Error(result.error.message);
  return {
    rows: (result.data ?? []) as SalesPortfolioClient[],
    count: result.count ?? 0,
    coverage: "gestelit_only" as const,
  };
}

const SALES_ANALYTICS_PAGE_SIZE = 1000;

function analyticsDateRange(params: SalesListParams) {
  const dateTo = params.dateTo ? new Date(params.dateTo) : new Date();
  const dateFrom = params.dateFrom
    ? new Date(params.dateFrom)
    : new Date(dateTo.getTime() - 89 * 86_400_000);
  const safeFrom = Number.isNaN(dateFrom.getTime()) ? new Date(dateTo.getTime() - 89 * 86_400_000) : dateFrom;
  const safeTo = Number.isNaN(dateTo.getTime()) ? new Date() : dateTo;
  return {
    dateFrom: safeFrom.toISOString(),
    dateTo: safeTo.toISOString(),
    periodDays: Math.max(1, Math.ceil((safeTo.getTime() - safeFrom.getTime()) / 86_400_000)),
  };
}

async function fetchFilteredAnalyticsRows(
  params: SalesListParams,
  dateFrom: string,
  dateTo: string,
  scope: { salesUserId?: string } = {},
  maxRows = Number.POSITIVE_INFINITY,
) {
  const supabase = createServiceSupabase();
  const rows: SalesReportActivityRow[] = [];
  let totalCount = 0;

  while (rows.length < maxRows) {
    const offset = rows.length;
    let query = supabase
      .from("mart_sales_activity_scoped")
      .select("id,sales_user_id,event_type,event_at,salesperson,customer_name,customer_code,local_client_id,contact_person,contact_occurred,raw_note,ai_summary,ai_next_action,next_action_date,estimated_revenue,actual_revenue,currency,status,source,customer_group,area,account_manager,dormancy_bucket,coverage_scope,created_at,updated_at", { count: "exact" })
      .gte("event_at", dateFrom)
      .lte("event_at", dateTo)
      .order("event_at", { ascending: false })
      .range(offset, offset + SALES_ANALYTICS_PAGE_SIZE - 1);

    if (scope.salesUserId) query = query.eq("sales_user_id", scope.salesUserId);

    if (params.salesperson) query = query.ilike("salesperson", likePattern(params.salesperson) ?? "%");
    if (params.eventType && isSalesEventType(params.eventType)) query = query.eq("event_type", params.eventType);
    if (params.status && isSalesStatus(params.status)) query = query.eq("status", params.status);
    if (params.accountManager) query = query.ilike("account_manager", likePattern(params.accountManager) ?? "%");
    if (params.customerGroup) query = query.eq("customer_group", params.customerGroup);
    if (params.area) query = query.eq("area", params.area);
    if (params.dormancyBucket) query = query.eq("dormancy_bucket", params.dormancyBucket);
    if (params.coverage) query = query.eq("coverage_scope", params.coverage);
    if (params.client) {
      const clientPattern = likePattern(params.client);
      const customerCode = normalizeSalesInteger(params.client);
      if (clientPattern) {
        query = query.or([
          `customer_name.ilike.${clientPattern}`,
          ...(customerCode == null ? [] : [`customer_code.eq.${customerCode}`]),
        ].join(","));
      }
    }

    const { data, count, error } = await query;
    if (error) throw new Error(error.message);
    totalCount = count ?? totalCount;
    rows.push(...((data ?? []) as SalesReportActivityRow[]));
    if ((data?.length ?? 0) < SALES_ANALYTICS_PAGE_SIZE) break;
  }

  return { rows, isTruncated: totalCount > rows.length };
}

async function fetchExactSalesAggregates(
  params: SalesListParams,
  dateFrom: string,
  dateTo: string,
  scope: { salesUserId?: string } = {},
) {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase.rpc("get_sales_dashboard_summary", {
    p_from: dateFrom,
    p_to: dateTo,
    p_activity_sales_user_id: scope.salesUserId ?? null,
    p_activity_salesperson: params.salesperson?.trim() || null,
    p_account_manager: params.accountManager?.trim() || null,
    p_client_search: params.client?.trim() || null,
    p_event_type: params.eventType && isSalesEventType(params.eventType) ? params.eventType : null,
    p_status: params.status && isSalesStatus(params.status) ? params.status : null,
    p_customer_group: params.customerGroup?.trim() || null,
    p_area: params.area?.trim() || null,
    p_dormancy_bucket: params.dormancyBucket?.trim() || null,
    p_coverage: params.coverage?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    activity_count: Number(row.activity_count ?? 0),
    unique_client_count: Number(row.unique_client_count ?? 0),
    open_count: Number(row.open_count ?? 0),
    won_count: Number(row.won_count ?? 0),
    lost_count: Number(row.lost_count ?? 0),
    meeting_count: Number(row.meeting_count ?? 0),
    call_count: Number(row.call_count ?? 0),
    lead_count: Number(row.lead_count ?? 0),
    sale_count: Number(row.sale_count ?? 0),
    follow_up_count: Number(row.follow_up_count ?? 0),
    open_follow_up_count: Number(row.open_follow_up_count ?? 0),
    overdue_follow_up_count: Number(row.overdue_follow_up_count ?? 0),
    estimated_pipeline: Number(row.estimated_pipeline ?? 0),
    won_revenue: Number(row.won_revenue ?? 0),
  })) as SalesDashboardAggregate[];
}

function salesSummaryFromRows(
  rows: SalesReportActivityRow[],
  options: {
    periodDays: number;
    isTruncated: boolean;
    binaMonthRevenue?: number;
    recentBinaSales?: SalesSummary["recentBinaSales"];
    exactAggregates?: SalesDashboardAggregate[];
  },
): SalesSummary {
  const filtered = buildFilteredSalesAnalytics(rows, {
    periodDays: options.periodDays,
    isTruncated: options.isTruncated,
  });
  const topClients: SalesClientActivity[] = filtered.topClients.map((client) => ({
    local_client_id: client.local_client_id,
    customer_code: client.customer_code,
    customer_name: client.customer_name,
    invoice_count: 0,
    invoice_revenue: 0,
    last_invoice_at: null,
    activity_count: client.activity_count,
    estimated_pipeline: client.estimated_pipeline,
    last_activity_at: client.last_activity_at,
    salesperson: client.salesperson,
    customer_group: client.customer_group,
    customer_status: null,
    bookkeeping_no: null,
    contact_person: null,
    opened_at: null,
    name_source: "manual_activity",
    combined_score: client.estimated_pipeline + client.activity_count,
  }));

  const exact = options.exactAggregates;
  const headline = exact ? selectSalesHeadlineCurrency(exact) : undefined;
  const total = (field: keyof SalesDashboardAggregate) => exact?.reduce((sum, row) => sum + Number(row[field] ?? 0), 0) ?? 0;
  const eventExact: Partial<Record<SalesEventType, number>> = exact ? {
    meeting: total("meeting_count"),
    call: total("call_count"),
    lead: total("lead_count"),
    sale: total("sale_count"),
    follow_up: total("follow_up_count"),
  } : {};
  const exactActivityCount = exact ? total("activity_count") : filtered.analytics.filteredCount;
  const exactFunnel = exact ? {
    open: total("open_count"),
    won: total("won_count"),
    lost: total("lost_count"),
    winRate: total("won_count") + total("lost_count") > 0
      ? total("won_count") / (total("won_count") + total("lost_count"))
      : 0,
  } : filtered.analytics.funnel;

  return {
    todayCount: filtered.todayCount,
    weekCount: filtered.weekCount,
    openFollowUps: exact ? total("open_follow_up_count") : filtered.openFollowUps,
    overdueFollowUps: exact ? total("overdue_follow_up_count") : filtered.overdueFollowUps,
    estimatedPipeline: exact ? Number(headline?.estimated_pipeline ?? 0) : filtered.estimatedPipeline,
    actualLoggedRevenue: exact ? Number(headline?.won_revenue ?? 0) : filtered.actualLoggedRevenue,
    headlineCurrency: headline?.currency_code ?? "ILS",
    binaMonthRevenue: options.binaMonthRevenue ?? 0,
    topClients,
    recentBinaSales: options.recentBinaSales ?? [],
    analytics: {
      ...filtered.analytics,
      filteredCount: exactActivityCount,
      funnel: exactFunnel,
      eventMix: filtered.analytics.eventMix.map((row) => ({
        ...row,
        activityCount: eventExact[row.eventType as SalesEventType] ?? row.activityCount,
      })),
      currencies: exact?.map((row) => ({
        currency: row.currency_code,
        estimatedPipeline: row.estimated_pipeline,
        wonRevenue: row.won_revenue,
        wonCount: row.won_count,
        openCount: row.open_count,
      })) ?? filtered.analytics.currencies,
    } as SalesSummary["analytics"],
  };
}

export async function fetchSalesSummary(params: SalesListParams = {}): Promise<SalesSummary> {
  const supabase = createServiceSupabase();
  const range = analyticsDateRange(params);
  const [{ rows, isTruncated }, exactAggregates, binaSummaryResult] = await Promise.all([
    fetchFilteredAnalyticsRows(params, range.dateFrom, range.dateTo),
    fetchExactSalesAggregates(params, range.dateFrom, range.dateTo),
    supabase.rpc("get_filtered_bina_sales_total", {
      p_from: range.dateFrom,
      p_to: range.dateTo,
      p_salesperson: params.salesperson?.trim() || null,
      p_client_search: params.client?.trim() || null,
    }),
  ]);
  if (binaSummaryResult.error) throw new Error(binaSummaryResult.error.message);

  let binaQuery = supabase
    .from("mart_bina_sales_status")
    .select("bina_id,invoice_no,customer_name,invoice_at,total_amount,salesperson")
    .gte("invoice_at", range.dateFrom)
    .lte("invoice_at", range.dateTo)
    .order("invoice_at", { ascending: false })
    .limit(200);
  if (params.salesperson) binaQuery = binaQuery.ilike("salesperson", likePattern(params.salesperson) ?? "%");
  if (params.client) binaQuery = binaQuery.ilike("customer_name", likePattern(params.client) ?? "%");
  const binaResult = await binaQuery;
  if (binaResult.error) throw new Error(binaResult.error.message);

  return salesSummaryFromRows(rows, {
    periodDays: range.periodDays,
    isTruncated,
    binaMonthRevenue: Number(binaSummaryResult.data ?? 0),
    recentBinaSales: (binaResult.data ?? []) as SalesSummary["recentBinaSales"],
    exactAggregates,
  });
}

export async function fetchSalesDashboardFilterOptions() {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase.rpc("get_sales_dashboard_filter_options");
  if (error) throw new Error(error.message);
  const value = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const strings = (key: string) => Array.isArray(value[key])
    ? (value[key] as unknown[]).filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
  return {
    salespeople: strings("salespeople"),
    accountManagers: strings("accountManagers"),
    customerGroups: strings("customerGroups"),
    areas: strings("areas"),
    gestelitCoverageStartAt: typeof value.gestelitCoverageStartAt === "string" ? value.gestelitCoverageStartAt : null,
  };
}

export async function fetchSalesUserDashboard(
  salesUserId: string,
  params: SalesListParams = {},
): Promise<SalesSummary> {
  const range = analyticsDateRange(params);
  const [{ rows, isTruncated }, exactAggregates] = await Promise.all([
    fetchFilteredAnalyticsRows(params, range.dateFrom, range.dateTo, { salesUserId }),
    fetchExactSalesAggregates(params, range.dateFrom, range.dateTo, { salesUserId }),
  ]);
  return salesSummaryFromRows(rows, {
    periodDays: range.periodDays,
    isTruncated,
    exactAggregates,
  });
}

export async function fetchSalesReportData(
  params: SalesListParams = {},
  scope: { salesUserId?: string } = {},
): Promise<SalesReportData> {
  const range = analyticsDateRange(params);
  const { rows, isTruncated } = await fetchFilteredAnalyticsRows(
    params,
    range.dateFrom,
    range.dateTo,
    scope,
    Number.POSITIVE_INFINITY,
  );
  return {
    generatedAt: new Date().toISOString(),
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    rows,
    summary: salesSummaryFromRows(rows, {
      periodDays: range.periodDays,
      isTruncated,
    }),
  };
}
