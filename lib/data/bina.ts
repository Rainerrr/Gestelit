import { createServiceSupabase } from "@/lib/supabase/client";
import { createJobAdmin, findJobByNumber, getJobById } from "@/lib/data/jobs";
import { createJobItem } from "@/lib/data/job-items";
import type { Job, JobItemWithDetails } from "@/lib/types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const STALE_SECONDS = 6 * 60 * 60;

export type BinaConfidence = "exact" | "inferred" | "missing_data";

export type BinaOverview = {
  sync: {
    lastSyncedAt: string | null;
    staleTables: number;
    failedTables: number;
    tableCount: number;
  };
  workOrders: {
    total: number;
    notImported: number;
    atRisk: number;
    quantityMismatch: number;
  };
  purchasing: {
    openRequestLines: number;
    openRequestAmount: number;
  };
  suppliers: {
    supplierCount: number;
    openBalance: number;
    overdueBalance: number;
  };
  sales: {
    invoiceCount: number;
    totalAmount: number;
  };
  deliveries: {
    total: number;
    sentOpen: number;
  };
};

export type BinaWorkOrderSummary = {
  bina_id: string;
  work_order_id: number | null;
  customer_name: string | null;
  title: string | null;
  status_text: string | null;
  bina_quantity: number | null;
  created_at: string | null;
  due_at: string | null;
  synced_at: string | null;
  gestelit_job_id: string | null;
  gestelit_job_number: string | null;
  gestelit_planned_quantity: number | null;
  gestelit_completed_good: number | null;
  bina_production_row_count: number | null;
  link_status: "not_imported" | "linked" | "quantity_mismatch" | "at_risk";
};

export type BinaProductionRow = {
  source_table: string;
  bina_id: string;
  work_order_id: number | null;
  work_line_no: number | null;
  item_code: string | null;
  item_name: string | null;
  planned_quantity: number | null;
  actual_quantity: number | null;
  machine_name: string | null;
  status_code: string | null;
  started_at: string | null;
  ended_at: string | null;
  synced_at: string | null;
};

export type BinaWorkOrderDetail = {
  order: BinaWorkOrderSummary | null;
  productionRows: BinaProductionRow[];
};

export type BinaPurchasingRow = {
  bina_id: string;
  flow_type: "purchase_request" | "goods_receipt";
  document_no: string | null;
  work_order_id?: number | null;
  supplier_code: number | null;
  supplier_name: string | null;
  item_code: string | null;
  item_name: string | null;
  quantity: number | null;
  remaining_quantity: number | null;
  total_amount: number | null;
  currency: string | null;
  document_at: string | null;
  synced_at: string | null;
};

export type BinaSupplierSummary = {
  supplier_code: number;
  supplier_name: string;
  currency: string | null;
  open_balance: number | null;
  overdue_balance: number | null;
  oldest_due_at: string | null;
  open_items: number | null;
  synced_at: string | null;
};

export type BinaFinanceRow = {
  kind: "customer_invoice" | "supplier_invoice" | "debt";
  bina_id: string;
  document_no: string | null;
  party_code: number | null;
  party_name: string | null;
  document_at: string | null;
  due_at: string | null;
  total_amount: number | null;
  balance: number | null;
  currency: string | null;
  synced_at: string | null;
};

export type BinaSalesRow = {
  bina_id: string;
  invoice_no: number | null;
  work_year: number | null;
  customer_code: number | null;
  customer_name: string | null;
  invoice_at: string | null;
  due_at: string | null;
  work_order_id: number | null;
  delivery_no: number | null;
  subtotal: number | null;
  vat: number | null;
  total_amount: number | null;
  salesperson: string | null;
  paid_flag: number | null;
  synced_at: string | null;
};

export type BinaDeliveryRow = {
  bina_id: string;
  delivery_no: number | null;
  customer_name: string | null;
  delivery_at: string | null;
  sent_at: string | null;
  received_flag: number | null;
  carrier: string | null;
  tracking_no: string | null;
  work_order_id: number | null;
  invoice_no: number | null;
  delivery_state: "returned_or_received" | "sent_open" | "draft_or_unknown";
  synced_at: string | null;
};

export type BinaSyncStatus = {
  tables: Array<{
    source_table: string;
    storage_table: string;
    row_count: number;
    last_row_synced_at: string | null;
    age_seconds: number | null;
    freshness_status: "ok" | "stale" | "empty";
  }>;
  logs: Array<{
    id: string;
    synced_at: string;
    created_at: string;
    results: Record<string, { upserted?: number; error?: string }>;
  }>;
};

export type BinaImportPayload = {
  pipeline_preset_id?: string | null;
  station_ids?: string[];
  first_product_approval_flags?: Record<string, boolean>;
  allowQuantityFallback?: boolean;
  created_by?: string;
};

export type BinaImportResult = {
  job: Job;
  items: JobItemWithDetails[];
  linkedExistingJob: boolean;
};

type PageParams = {
  search?: string | null;
  limit?: number;
  offset?: number;
};

const WORK_ORDER_COLUMNS = [
  "bina_id",
  "work_order_id",
  "customer_name",
  "customer_code",
  "title",
  "customer_order_ref",
  "status_code",
  "status_text",
  "bina_quantity",
  "created_at",
  "due_at",
  "synced_at",
  "gestelit_job_id",
  "gestelit_job_number",
  "gestelit_due_date",
  "gestelit_item_count",
  "gestelit_planned_quantity",
  "gestelit_completed_good",
  "bina_production_row_count",
  "link_status",
].join(",");

const PRODUCTION_ROW_COLUMNS = [
  "source_table",
  "bina_id",
  "work_order_id",
  "work_line_no",
  "item_code",
  "item_name",
  "planned_quantity",
  "actual_quantity",
  "machine_name",
  "customer_name",
  "received_at",
  "due_at",
  "started_at",
  "ended_at",
  "status_code",
  "synced_at",
].join(",");

const PURCHASING_COLUMNS = [
  "bina_id",
  "flow_type",
  "document_no",
  "work_order_id",
  "supplier_code",
  "supplier_name",
  "item_code",
  "item_name",
  "quantity",
  "remaining_quantity",
  "total_amount",
  "currency",
  "document_at",
  "synced_at",
].join(",");

const SUPPLIER_COLUMNS = [
  "supplier_code",
  "supplier_name",
  "currency",
  "open_balance",
  "overdue_balance",
  "oldest_due_at",
  "open_items",
  "synced_at",
].join(",");

const FINANCE_COLUMNS = [
  "kind",
  "bina_id",
  "document_no",
  "party_code",
  "party_name",
  "document_at",
  "due_at",
  "total_amount",
  "balance",
  "currency",
  "synced_at",
].join(",");

const SALES_COLUMNS = [
  "bina_id",
  "invoice_no",
  "work_year",
  "customer_code",
  "customer_name",
  "invoice_at",
  "due_at",
  "work_order_id",
  "delivery_no",
  "subtotal",
  "vat",
  "total_amount",
  "salesperson",
  "paid_flag",
  "synced_at",
].join(",");

const DELIVERY_COLUMNS = [
  "bina_id",
  "delivery_no",
  "customer_name",
  "delivery_at",
  "sent_at",
  "received_flag",
  "carrier",
  "tracking_no",
  "work_order_id",
  "invoice_no",
  "delivery_state",
  "synced_at",
].join(",");

function clampLimit(limit?: number) {
  if (!limit || Number.isNaN(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function toCount(value: unknown): number {
  return normalizeNumber(value) ?? 0;
}

function likePattern(search?: string | null) {
  const trimmed = search?.trim();
  return trimmed ? `%${trimmed}%` : null;
}

function isUuid(value: string | null | undefined) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

async function validateBinaImportPipeline(supabase: ReturnType<typeof createServiceSupabase>, payload: BinaImportPayload) {
  if (payload.pipeline_preset_id) {
    if (!isUuid(payload.pipeline_preset_id)) throw new Error("INVALID_PIPELINE_PRESET");
    const { data, error } = await supabase
      .from("pipeline_presets")
      .select("id,is_active,pipeline_preset_steps(id)")
      .eq("id", payload.pipeline_preset_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const steps = (data as unknown as { pipeline_preset_steps?: unknown[] } | null)?.pipeline_preset_steps ?? [];
    if (!data || data.is_active === false || steps.length === 0) throw new Error("INVALID_PIPELINE_PRESET");
    return;
  }

  const stationIds = payload.station_ids ?? [];
  if (stationIds.length === 0) throw new Error("PIPELINE_REQUIRED");
  if (stationIds.some((id) => !isUuid(id))) throw new Error("INVALID_STATIONS");
  const { data, error } = await supabase
    .from("stations")
    .select("id")
    .in("id", stationIds)
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  if ((data ?? []).length !== new Set(stationIds).size) throw new Error("INVALID_STATIONS");
}

export async function fetchBinaOverview(): Promise<BinaOverview> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("mart_bina_overview_kpis")
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;

  return {
    sync: {
      lastSyncedAt: normalizeString(row.last_synced_at),
      staleTables: toCount(row.stale_tables),
      failedTables: toCount(row.empty_tables),
      tableCount: toCount(row.table_count),
    },
    workOrders: {
      total: toCount(row.work_order_total),
      notImported: toCount(row.work_order_not_imported),
      atRisk: toCount(row.work_order_at_risk),
      quantityMismatch: toCount(row.work_order_quantity_mismatch),
    },
    purchasing: {
      openRequestLines: toCount(row.open_request_lines),
      openRequestAmount: toCount(row.open_request_amount),
    },
    suppliers: {
      supplierCount: toCount(row.supplier_count),
      openBalance: toCount(row.supplier_open_balance),
      overdueBalance: toCount(row.supplier_overdue_balance),
    },
    sales: {
      invoiceCount: toCount(row.sales_invoice_count),
      totalAmount: toCount(row.sales_total_amount),
    },
    deliveries: {
      total: toCount(row.delivery_total),
      sentOpen: toCount(row.delivery_sent_open),
    },
  };
}

export async function fetchBinaWorkOrders(params: PageParams = {}) {
  const supabase = createServiceSupabase();
  const limit = clampLimit(params.limit);
  const offset = Math.max(0, params.offset ?? 0);
  const pattern = likePattern(params.search);

  let query = supabase
    .from("mart_bina_work_order_status")
    .select(WORK_ORDER_COLUMNS, { count: "exact" })
    .order("due_at", { ascending: true, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (pattern) {
    const numericSearch = normalizeNumber(params.search);
    const filters = [
      `customer_name.ilike.${pattern}`,
      `title.ilike.${pattern}`,
      `customer_order_ref.ilike.${pattern}`,
    ];
    if (numericSearch !== null) filters.push(`work_order_id.eq.${numericSearch}`);
    query = query.or(filters.join(","));
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as unknown as BinaWorkOrderSummary[], count: count ?? 0 };
}

export async function fetchBinaWorkOrderDetail(binaId: string): Promise<BinaWorkOrderDetail> {
  const supabase = createServiceSupabase();

  const { data: order, error: orderError } = await supabase
    .from("mart_bina_work_order_status")
    .select(WORK_ORDER_COLUMNS)
    .eq("bina_id", binaId)
    .maybeSingle();

  if (orderError) throw new Error(orderError.message);

  const workOrderId = normalizeNumber((order as BinaWorkOrderSummary | null)?.work_order_id);
  const { data: productionRows, error: rowsError } = await supabase
    .from("stg_bina_production_rows")
    .select(PRODUCTION_ROW_COLUMNS)
    .eq("work_order_id", workOrderId ?? -1)
    .order("work_line_no", { ascending: true });

  if (rowsError) throw new Error(rowsError.message);

  return {
    order: (order as unknown as BinaWorkOrderDetail["order"]) ?? null,
    productionRows: (productionRows ?? []) as unknown as BinaProductionRow[],
  };
}

export async function fetchBinaPurchasing(params: PageParams = {}) {
  const supabase = createServiceSupabase();
  const limit = clampLimit(params.limit);
  const offset = Math.max(0, params.offset ?? 0);
  const pattern = likePattern(params.search);

  let query = supabase
    .from("mart_bina_purchase_flow")
    .select(PURCHASING_COLUMNS, { count: "exact" })
    .order("synced_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (pattern) {
    query = query.or(
      [
        `supplier_name.ilike.${pattern}`,
        `item_name.ilike.${pattern}`,
        `item_code.ilike.${pattern}`,
        `document_no.ilike.${pattern}`,
        `work_order_id.eq.${normalizeNumber(params.search) ?? -1}`,
      ].join(","),
    );
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as unknown as BinaPurchasingRow[], count: count ?? 0 };
}

export async function fetchBinaSuppliers(params: PageParams = {}) {
  const supabase = createServiceSupabase();
  const limit = clampLimit(params.limit);
  const offset = Math.max(0, params.offset ?? 0);
  const pattern = likePattern(params.search);

  let query = supabase
    .from("mart_bina_supplier_aging")
    .select(SUPPLIER_COLUMNS, { count: "exact" })
    .order("overdue_balance", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (pattern) {
    query = query.ilike("supplier_name", pattern);
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as unknown as BinaSupplierSummary[], count: count ?? 0 };
}

export async function fetchBinaFinance(params: PageParams = {}) {
  const supabase = createServiceSupabase();
  const limit = clampLimit(params.limit);
  const offset = Math.max(0, params.offset ?? 0);
  const pattern = likePattern(params.search);

  let query = supabase
    .from("mart_bina_finance")
    .select(FINANCE_COLUMNS, { count: "exact" })
    .order("document_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (pattern) {
    query = query.or(
      [
        `document_no.ilike.${pattern}`,
        `party_name.ilike.${pattern}`,
        `currency.ilike.${pattern}`,
        `kind.ilike.${pattern}`,
      ].join(","),
    );
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as unknown as BinaFinanceRow[], count: count ?? 0 };
}

export async function fetchBinaSales(params: PageParams = {}) {
  const supabase = createServiceSupabase();
  const limit = clampLimit(params.limit);
  const offset = Math.max(0, params.offset ?? 0);
  const pattern = likePattern(params.search);

  let query = supabase
    .from("mart_bina_sales_status")
    .select(SALES_COLUMNS, { count: "exact" })
    .order("invoice_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (pattern) {
    const numericSearch = normalizeNumber(params.search);
    const filters = [`customer_name.ilike.${pattern}`, `salesperson.ilike.${pattern}`];
    if (numericSearch !== null) {
      filters.push(`invoice_no.eq.${numericSearch}`, `work_order_id.eq.${numericSearch}`);
    }
    query = query.or(filters.join(","));
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as unknown as BinaSalesRow[], count: count ?? 0 };
}

export async function fetchBinaDeliveries(params: PageParams = {}) {
  const supabase = createServiceSupabase();
  const limit = clampLimit(params.limit);
  const offset = Math.max(0, params.offset ?? 0);
  const pattern = likePattern(params.search);

  let query = supabase
    .from("mart_bina_delivery_status")
    .select(DELIVERY_COLUMNS, { count: "exact" })
    .order("delivery_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (pattern) {
    query = query.or(`customer_name.ilike.${pattern},carrier.ilike.${pattern},tracking_no.ilike.${pattern}`);
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as unknown as BinaDeliveryRow[], count: count ?? 0 };
}

export async function fetchBinaSyncStatus(): Promise<BinaSyncStatus> {
  const supabase = createServiceSupabase();

  const [tablesResult, logsResult] = await Promise.all([
    supabase.from("mart_bina_sync_health").select("*").order("source_table"),
    supabase.from("bina_sync_log").select("*").order("created_at", { ascending: false }).limit(20),
  ]);

  if (tablesResult.error) throw new Error(tablesResult.error.message);
  if (logsResult.error) throw new Error(logsResult.error.message);

  return {
    tables: (tablesResult.data ?? []) as BinaSyncStatus["tables"],
    logs: (logsResult.data ?? []) as BinaSyncStatus["logs"],
  };
}

export async function importBinaWorkOrderToGestelit(
  binaId: string,
  payload: BinaImportPayload,
): Promise<BinaImportResult> {
  const supabase = createServiceSupabase();

  const detail = await fetchBinaWorkOrderDetail(binaId);
  if (!detail.order?.work_order_id) {
    throw new Error("BINA_WORK_ORDER_NOT_FOUND");
  }

  const jobNumber = String(detail.order.work_order_id);
  const sourceRows = (detail.productionRows.length > 0 ? detail.productionRows : [{
    source_table: "DFHazmRashi",
    bina_id: binaId,
    work_order_id: detail.order.work_order_id,
    work_line_no: 1,
    item_code: null,
    item_name: detail.order.title ?? `פק״ע ${jobNumber}`,
    planned_quantity: detail.order.bina_quantity,
    actual_quantity: null,
    machine_name: null,
    status_code: detail.order.status_text,
    started_at: null,
    ended_at: null,
    synced_at: detail.order.synced_at,
  }]).slice(0, 100);

  const existingJobLink = await supabase
    .from("bina_gestelit_links")
    .select("gestelit_entity_id")
    .eq("bina_table", "DFHazmRashi")
    .eq("bina_id", binaId)
    .eq("gestelit_entity_type", "job")
    .maybeSingle();

  if (existingJobLink.error) throw new Error(existingJobLink.error.message);

  const itemLinkResults = await Promise.all(sourceRows.map((row) =>
    supabase
      .from("bina_gestelit_links")
      .select("gestelit_entity_id")
      .eq("bina_table", row.source_table)
      .eq("bina_id", row.bina_id)
      .eq("gestelit_entity_type", "job_item")
      .maybeSingle(),
  ));

  const linkedSourceRows = new Set<string>();
  itemLinkResults.forEach((result, index) => {
    if (result.error) throw new Error(result.error.message);
    if (result.data?.gestelit_entity_id) {
      const row = sourceRows[index];
      linkedSourceRows.add(`${row.source_table}:${row.bina_id}`);
    }
  });

  const missingRows = sourceRows.filter((row) => !linkedSourceRows.has(`${row.source_table}:${row.bina_id}`));
  const linkedJob = existingJobLink.data?.gestelit_entity_id
    ? await getJobById(String(existingJobLink.data.gestelit_entity_id))
    : null;

  if (linkedJob && missingRows.length === 0) {
    return { job: linkedJob, items: [], linkedExistingJob: true };
  }

  const hasPipeline = Boolean(payload.pipeline_preset_id || payload.station_ids?.length);
  if (missingRows.length > 0 && !hasPipeline) {
    throw new Error("PIPELINE_REQUIRED");
  }
  if (missingRows.length > 0) {
    await validateBinaImportPipeline(supabase, payload);
  }

  for (const row of missingRows) {
    const quantity = normalizeNumber(row.planned_quantity);
    if ((!quantity || quantity <= 0) && !payload.allowQuantityFallback) {
      throw new Error("BINA_QUANTITY_MISSING");
    }
  }

  const existingJob = linkedJob ?? await findJobByNumber(jobNumber);
  const job = existingJob ?? await createJobAdmin({
    job_number: jobNumber,
    customer_name: detail.order.customer_name ?? null,
    description: [detail.order.title, detail.order.status_text, `BINA ${jobNumber}`].filter(Boolean).join(" | "),
    due_date: detail.order.due_at ?? null,
  });

  const { error: jobLinkError } = await supabase.from("bina_gestelit_links").upsert({
    bina_table: "DFHazmRashi",
    bina_id: binaId,
    gestelit_entity_type: "job",
    gestelit_entity_id: job.id,
    created_by: payload.created_by ?? null,
    metadata: { work_order_id: detail.order.work_order_id },
  }, { onConflict: "bina_table,bina_id,gestelit_entity_type" });
  if (jobLinkError) throw new Error(jobLinkError.message);

  const items: JobItemWithDetails[] = [];
  for (const row of missingRows) {
    let quantity = normalizeNumber(row.planned_quantity);
    if (!quantity || quantity <= 0) quantity = 1;

    const item = await createJobItem({
      job_id: job.id,
      name: row.item_name ?? row.item_code ?? `פק״ע ${jobNumber}-${row.work_line_no ?? items.length + 1}`,
      planned_quantity: quantity,
      pipeline_preset_id: payload.pipeline_preset_id ?? null,
      station_ids: payload.station_ids,
      first_product_approval_flags: payload.first_product_approval_flags,
      is_active: true,
    });
    items.push(item);

    const { error: itemLinkError } = await supabase.from("bina_gestelit_links").upsert({
      bina_table: row.source_table,
      bina_id: row.bina_id,
      gestelit_entity_type: "job_item",
      gestelit_entity_id: item.id,
      created_by: payload.created_by ?? null,
      metadata: {
        work_order_id: row.work_order_id,
        work_line_no: row.work_line_no,
      },
    }, { onConflict: "bina_table,bina_id,gestelit_entity_type" });
    if (itemLinkError) {
      await supabase.from("job_items").delete().eq("id", item.id);
      throw new Error(itemLinkError.message);
    }
  }

  return { job, items, linkedExistingJob: Boolean(existingJob) };
}

export function summarizeSyncFreshness(status: BinaSyncStatus) {
  const stale = status.tables.filter((table) => table.freshness_status === "stale");
  const empty = status.tables.filter((table) => table.freshness_status === "empty");
  const latest = status.tables.reduce<string | null>((value, table) => {
    if (!table.last_row_synced_at) return value;
    return !value || table.last_row_synced_at > value ? table.last_row_synced_at : value;
  }, null);

  return {
    latest,
    staleCount: stale.length,
    emptyCount: empty.length,
    healthy: stale.length === 0 && empty.length === 0,
    staleThresholdSeconds: STALE_SECONDS,
  };
}
