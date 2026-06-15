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

export type BinaRiskRow = {
  risk_id: string;
  domain: string;
  severity: "low" | "medium" | "high";
  entity_type: string;
  bina_id: string | null;
  entity_key: string | null;
  entity_label: string | null;
  risk_reason: string;
  source_view: string;
  synced_at: string | null;
  confidence: BinaConfidence;
  risk_score: number;
};

export type BinaDataQualityIssue = {
  domain: string;
  source_name: string;
  issue_type: string;
  issue_label_he: string;
  affected_count: number;
  latest_synced_at: string | null;
  severity: "low" | "medium" | "high";
};

export type BinaSyncCoverageRow = {
  source_table: string;
  storage_table: string;
  row_count: number;
  last_row_synced_at: string | null;
  age_seconds: number | null;
  freshness_status: "ok" | "stale" | "empty" | "blocked" | string;
  sync_scope: string;
  source_row_count: number | null;
  source_min_id: string | null;
  source_max_id: string | null;
  source_min_date: string | null;
  source_max_date: string | null;
  is_complete_snapshot: boolean;
  sample_limited: boolean;
  coverage_status: "complete" | "partial_sample" | "stale_partial" | "empty" | string;
  coverage_note: string;
  domain?: string | null;
  grain?: string | null;
  trust_note?: string | null;
};

export type BinaDashboardSummary = {
  coverage: {
    table_count: number;
    complete_tables: number;
    partial_tables: number;
    empty_tables: number;
    stale_tables: number;
    last_synced_at: string | null;
    all_complete: boolean;
  };
  coverageStatus: "complete" | "partial_sample" | "stale" | "blocked_partial_sample" | string;
  overview: Record<string, unknown>;
  risks: BinaRiskRow[];
  dataQuality: BinaDataQualityIssue[];
  financeByConfidence: Array<Record<string, unknown>>;
  purchaseMetrics: Array<Record<string, unknown>>;
  deliveryMetrics: Array<Record<string, unknown>>;
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
  decision: BinaWorkOrderDecisionFact | null;
  relatedPurchasing: BinaPurchasingRow[];
  relatedDeliveries: BinaDeliveryRow[];
  relatedFinance: BinaFinanceRow[];
  relatedSales: BinaSalesRow[];
  routeSummary: {
    sourceTables: string[];
    machineNames: string[];
    rowCount: number;
    machineCount: number;
    relationshipConfidence: BinaConfidence;
  };
};

export type BinaWorkOrderDecisionFact = BinaWorkOrderSummary & {
  route_row_count: number | null;
  route_source_table_count: number | null;
  route_machine_count: number | null;
  route_source_tables: string[] | null;
  route_machine_names: string[] | null;
  first_started_at: string | null;
  last_ended_at: string | null;
  purchase_request_count: number | null;
  goods_receipt_count: number | null;
  open_purchase_quantity: number | null;
  open_purchase_amount: number | null;
  delivery_count: number | null;
  sent_open_delivery_count: number | null;
  last_sent_at: string | null;
  finance_document_count: number | null;
  receivable_open: number | null;
  payable_open: number | null;
  overdue_finance_count: number | null;
  invoice_count: number | null;
  sales_amount: number | null;
  unpaid_or_unknown_invoice_count: number | null;
  evidence_synced_at: string | null;
  blocker_type: string;
  next_action_reason: string;
  owner_role: string;
  priority_score: number;
  relationship_confidence: BinaConfidence;
};

export type BinaRouteSuggestion = {
  work_order_id: number;
  route_row_count: number;
  source_table_count: number;
  machine_count: number;
  mapped_step_count: number;
  unmapped_step_count: number;
  source_tables: string[] | null;
  machine_names: string[] | null;
  mapped_station_names: string[] | null;
  first_started_at: string | null;
  last_ended_at: string | null;
  synced_at: string | null;
  route_confidence: BinaConfidence;
  current_station_label: string | null;
  next_station_label: string | null;
};

export type BinaMaterialEvidenceLine = {
  work_order_id: number;
  item_code: string | null;
  item_name: string | null;
  required_quantity: number | null;
  stock_quantity: number | null;
  open_purchase_quantity: number | null;
  purchase_request_count: number | null;
  synced_at: string | null;
  readiness_state: "ready_inferred_inventory" | "purchase_requested" | "short_or_unknown" | "unknown" | string;
};

export type BinaMaterialReadinessRow = {
  work_order_id: number;
  required_item_count: number;
  ready_item_count: number;
  purchase_requested_item_count: number;
  short_or_unknown_item_count: number;
  required_quantity: number | null;
  matched_stock_quantity: number | null;
  open_purchase_quantity: number | null;
  synced_at: string | null;
  material_state: "ready_inferred_inventory" | "purchase_requested" | "short_or_unknown" | "unknown" | string;
  material_confidence: BinaConfidence;
  trust_note: string;
  evidence_lines: BinaMaterialEvidenceLine[];
};

export type BinaWorkOrderOperationalProfile = {
  workOrder: BinaWorkOrderSummary | null;
  decision: BinaWorkOrderDecisionFact | null;
  route: BinaRouteSuggestion | null;
  material: BinaMaterialReadinessRow | null;
  productionRows: BinaProductionRow[];
  relatedPurchasing: BinaPurchasingRow[];
  relatedDeliveries: BinaDeliveryRow[];
  relatedFinance: BinaFinanceRow[];
  relatedSales: BinaSalesRow[];
  operationalSignals: {
    workOrderId: number | null;
    materialState: string;
    routeConfidence: BinaConfidence;
    relationshipConfidence: BinaConfidence;
    currentStationLabel: string | null;
    nextStationLabel: string | null;
    openPurchaseQuantity: number;
    unmappedRouteSteps: number;
    blockerType: string | null;
    nextActionReason: string | null;
    ownerRole: string | null;
    priorityScore: number | null;
  };
};

export type BinaProductionDashboard = {
  coverage?: AnyRecord;
  coverageStatus: string;
  metrics: AnyRecord;
  lanes: Record<string, BinaWorkOrderDecisionFact[]>;
  risks: BinaWorkOrderDecisionFact[];
  unmappedOperations: AnyRecord[];
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
  finance_direction: "receivable" | "payable";
  party_type: "customer" | "supplier";
  document_type_label: string;
  bina_id: string;
  document_no: string | null;
  party_code: number | null;
  party_name: string | null;
  document_at: string | null;
  due_at: string | null;
  total_amount: number | null;
  open_amount: number | null;
  currency: string | null;
  currency_group: string;
  paid_status: "paid" | "open" | "open_inferred" | "overdue" | "unknown";
  balance_confidence: BinaConfidence;
  aging_bucket: string;
  overdue_days: number | null;
  date_quality: "valid" | "missing" | "suspicious";
  related_work_order_id: number | null;
  related_delivery_no: number | null;
  salesperson: string | null;
  related_goods_receipt_no: number | null;
  risk_score: number;
  risk_reason: string;
  synced_at: string | null;
};

export type BinaFinanceSummaryCurrency = {
  currency_group: string;
  document_count: number;
  customer_invoice_count: number;
  supplier_invoice_count: number;
  debt_count: number;
  suspicious_date_count: number;
  receivable_total: number;
  receivable_open: number;
  receivable_overdue: number;
  supplier_invoice_total: number;
  payable_open: number;
  payable_overdue: number;
  due_this_week: number;
  last_synced_at: string | null;
};

export type BinaFinanceAgingBucket = {
  currency_group: string;
  finance_direction: "receivable" | "payable";
  party_type: "customer" | "supplier";
  aging_bucket: string;
  document_count: number;
  open_amount: number;
  last_synced_at: string | null;
};

export type BinaFinanceSummary = {
  asOf: string;
  primaryCurrency: string;
  currencies: BinaFinanceSummaryCurrency[];
  totals: {
    documentCount: number;
    customerInvoiceCount: number;
    supplierInvoiceCount: number;
    debtCount: number;
    suspiciousDateCount: number;
    receivableOpen: number;
    receivableOverdue: number;
    payableOpen: number;
    payableOverdue: number;
    dueThisWeek: number;
  };
  aging: BinaFinanceAgingBucket[];
  exceptions: BinaFinanceRow[];
};

export type BinaFinanceDetail = {
  transaction: BinaFinanceRow | null;
  customerInvoiceLines: AnyRecord[];
  supplierInvoiceLines: AnyRecord[];
  relatedSales: BinaSalesRow[];
  relatedDeliveries: BinaDeliveryRow[];
  relatedWorkOrders: BinaWorkOrderSummary[];
  relatedPurchasing: BinaPurchasingRow[];
  relatedSuppliers: BinaSupplierSummary[];
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
    freshness_status: "ok" | "stale" | "empty" | "blocked" | string;
  }>;
  coverage?: BinaSyncCoverageRow[];
  dataQuality?: BinaDataQualityIssue[];
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

type AnyRecord = Record<string, unknown>;

export type BinaFinanceParams = PageParams & {
  kind?: string | null;
  partyType?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  dueFrom?: string | null;
  dueTo?: string | null;
  overdueOnly?: boolean;
  openOnly?: boolean;
  currency?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  agingBucket?: string | null;
  dateQuality?: string | null;
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

const WORK_ORDER_DECISION_BASE_COLUMNS = [
  "bina_id",
  "work_order_id",
  "customer_name",
  "customer_code",
  "title",
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

const WORK_ORDER_DECISION_COLUMNS = [
  WORK_ORDER_DECISION_BASE_COLUMNS,
  "route_row_count",
  "route_source_table_count",
  "route_machine_count",
  "route_source_tables",
  "route_machine_names",
  "first_started_at",
  "last_ended_at",
  "purchase_request_count",
  "goods_receipt_count",
  "open_purchase_quantity",
  "open_purchase_amount",
  "delivery_count",
  "sent_open_delivery_count",
  "last_sent_at",
  "finance_document_count",
  "receivable_open",
  "payable_open",
  "overdue_finance_count",
  "invoice_count",
  "sales_amount",
  "unpaid_or_unknown_invoice_count",
  "evidence_synced_at",
  "blocker_type",
  "next_action_reason",
  "owner_role",
  "priority_score",
  "relationship_confidence",
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
  "finance_direction",
  "party_type",
  "document_type_label",
  "bina_id",
  "document_no",
  "party_code",
  "party_name",
  "document_at",
  "due_at",
  "total_amount",
  "open_amount",
  "currency",
  "currency_group",
  "paid_status",
  "balance_confidence",
  "aging_bucket",
  "overdue_days",
  "date_quality",
  "related_work_order_id",
  "related_delivery_no",
  "salesperson",
  "related_goods_receipt_no",
  "risk_score",
  "risk_reason",
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

const MATERIAL_READINESS_COLUMNS = [
  "work_order_id",
  "required_item_count",
  "ready_item_count",
  "purchase_requested_item_count",
  "short_or_unknown_item_count",
  "required_quantity",
  "matched_stock_quantity",
  "open_purchase_quantity",
  "synced_at",
  "material_state",
  "material_confidence",
  "trust_note",
  "evidence_lines",
].join(",");

const ROUTE_SUGGESTION_COLUMNS = [
  "work_order_id",
  "route_row_count",
  "source_table_count",
  "machine_count",
  "mapped_step_count",
  "unmapped_step_count",
  "source_tables",
  "machine_names",
  "mapped_station_names",
  "first_started_at",
  "last_ended_at",
  "synced_at",
  "route_confidence",
  "current_station_label",
  "next_station_label",
].join(",");

function clampLimit(limit?: number) {
  if (!limit || Number.isNaN(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

function fallbackDashboardSummary(
  overview: BinaOverview,
  sync?: BinaSyncStatus,
  risks: BinaRiskRow[] = [],
): BinaDashboardSummary {
  const tables = sync?.tables ?? [];
  const latest = overview.sync.lastSyncedAt;
  return {
    coverage: {
      table_count: overview.sync.tableCount,
      complete_tables: 0,
      partial_tables: overview.sync.tableCount,
      empty_tables: overview.sync.failedTables,
      stale_tables: overview.sync.staleTables,
      last_synced_at: latest,
      all_complete: false,
    },
    coverageStatus: "partial_sample",
    overview: {
      last_synced_at: latest,
      stale_tables: overview.sync.staleTables,
      empty_tables: overview.sync.failedTables,
      table_count: overview.sync.tableCount,
      work_order_total: overview.workOrders.total,
      work_order_not_imported: overview.workOrders.notImported,
      work_order_at_risk: overview.workOrders.atRisk,
      work_order_quantity_mismatch: overview.workOrders.quantityMismatch,
      open_request_lines: overview.purchasing.openRequestLines,
      open_request_amount: overview.purchasing.openRequestAmount,
      supplier_count: overview.suppliers.supplierCount,
      supplier_open_balance: overview.suppliers.openBalance,
      supplier_overdue_balance: overview.suppliers.overdueBalance,
      sales_invoice_count: overview.sales.invoiceCount,
      sales_total_amount: overview.sales.totalAmount,
      delivery_total: overview.deliveries.total,
      delivery_sent_open: overview.deliveries.sentOpen,
    },
    risks,
    dataQuality: tables
      .filter((table) => table.freshness_status !== "ok")
      .map((table) => ({
        domain: "sync",
        source_name: table.source_table,
        issue_type: table.freshness_status,
        issue_label_he: table.freshness_status === "empty" ? "טבלת BINA ריקה או לא סונכרנה" : "טבלת BINA מיושנת",
        affected_count: table.row_count,
        latest_synced_at: table.last_row_synced_at,
        severity: table.freshness_status === "empty" ? "high" : "medium",
      })),
    financeByConfidence: [],
    purchaseMetrics: [],
    deliveryMetrics: [],
  };
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

function normalizeBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === 1;
}

function toCount(value: unknown): number {
  return normalizeNumber(value) ?? 0;
}

function isAnyRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function enrichDashboardSummaryWithTrust(
  summary: BinaDashboardSummary,
  trustPayload: unknown,
): BinaDashboardSummary {
  if (!isAnyRecord(trustPayload)) return summary;
  const trust = isAnyRecord(trustPayload.trust) ? trustPayload.trust : {};
  const warnings = Array.isArray(trustPayload.warnings) ? trustPayload.warnings : [];
  const domains = Array.isArray(trustPayload.domains) ? trustPayload.domains : [];
  const metricTrust = Array.isArray(trustPayload.metricTrust) ? trustPayload.metricTrust : [];
  const sourceCount = toCount(trust.source_count);

  return {
    ...summary,
    coverage: {
      table_count: sourceCount || summary.coverage.table_count,
      complete_tables: toCount(trust.complete_sources),
      partial_tables: toCount(trust.partial_sources),
      empty_tables: toCount(trust.empty_sources),
      stale_tables: toCount(trust.stale_sources),
      last_synced_at: normalizeString(trust.last_synced_at) ?? summary.coverage.last_synced_at,
      all_complete: normalizeBoolean(trust.executive_ready),
    },
    coverageStatus: String(trustPayload.coverageStatus ?? summary.coverageStatus),
    overview: {
      ...summary.overview,
      trust_domains: domains,
      trust_warnings: warnings,
      metric_trust: metricTrust,
      blocked_sources: toCount(trust.blocked_sources),
      metric_not_authoritative: !normalizeBoolean(trust.executive_ready),
    },
  };
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

  const [syncResult, workOrdersResult, purchasingResult, suppliersResult, salesResult, deliveriesResult] = await Promise.all([
    supabase
      .from("mart_bina_metric_trust")
      .select("source_table,freshness_status,last_table_sync_at")
      .order("source_table"),
    supabase
      .from("mart_bina_work_order_status")
      .select("link_status,synced_at")
      .order("work_order_id", { ascending: false, nullsFirst: false })
      .limit(1000),
    supabase
      .from("mart_bina_purchase_flow")
      .select("flow_type,remaining_quantity,total_amount")
      .limit(5000),
    supabase
      .from("mart_bina_supplier_aging")
      .select("supplier_code,open_balance,overdue_balance")
      .limit(5000),
    supabase
      .from("mart_bina_sales_status")
      .select("total_amount")
      .limit(5000),
    supabase
      .from("mart_bina_delivery_status")
      .select("delivery_state")
      .limit(5000),
  ]);

  if (workOrdersResult.error) throw new Error(workOrdersResult.error.message);

  const syncRows = syncResult.error ? [] : ((syncResult.data ?? []) as AnyRecord[]);
  const workOrderRows = (workOrdersResult.data ?? []) as AnyRecord[];
  const purchasingRows = purchasingResult.error ? [] : ((purchasingResult.data ?? []) as AnyRecord[]);
  const supplierRows = suppliersResult.error ? [] : ((suppliersResult.data ?? []) as AnyRecord[]);
  const salesRows = salesResult.error ? [] : ((salesResult.data ?? []) as AnyRecord[]);
  const deliveryRows = deliveriesResult.error ? [] : ((deliveriesResult.data ?? []) as AnyRecord[]);

  const lastSyncedAt = syncRows.reduce<string | null>((latest, row) => {
    const value = normalizeString(row.last_table_sync_at);
    if (!value) return latest;
    return !latest || value > latest ? value : latest;
  }, null);

  return {
    sync: {
      lastSyncedAt,
      staleTables: syncRows.filter((row) => row.freshness_status === "stale").length,
      failedTables: syncRows.filter((row) => row.freshness_status === "blocked" || row.freshness_status === "empty").length,
      tableCount: new Set(syncRows.map((row) => row.source_table).filter(Boolean)).size,
    },
    workOrders: {
      total: workOrderRows.length,
      notImported: workOrderRows.filter((row) => row.link_status === "not_imported").length,
      atRisk: workOrderRows.filter((row) => row.link_status === "at_risk").length,
      quantityMismatch: workOrderRows.filter((row) => row.link_status === "quantity_mismatch").length,
    },
    purchasing: {
      openRequestLines: purchasingRows.filter(
        (row) => row.flow_type === "purchase_request" && Number(row.remaining_quantity ?? 0) > 0,
      ).length,
      openRequestAmount: purchasingRows.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0),
    },
    suppliers: {
      supplierCount: new Set(supplierRows.map((row) => row.supplier_code).filter(Boolean)).size,
      openBalance: supplierRows.reduce((sum, row) => sum + Number(row.open_balance ?? 0), 0),
      overdueBalance: supplierRows.reduce((sum, row) => sum + Number(row.overdue_balance ?? 0), 0),
    },
    sales: {
      invoiceCount: salesRows.length,
      totalAmount: salesRows.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0),
    },
    deliveries: {
      total: deliveryRows.length,
      sentOpen: deliveryRows.filter((row) => row.delivery_state === "sent_open").length,
    },
  };
}

export async function fetchBinaDashboardSummary(): Promise<BinaDashboardSummary> {
  const supabase = createServiceSupabase();

  const [summaryResult, trustResult] = await Promise.all([
    supabase.rpc("rpc_bina_dashboard_summary", {
      date_from: null,
      date_to: null,
      currency_code: null,
      require_complete_snapshot: false,
    }),
    supabase.rpc("rpc_bina_dashboard_summary_v2", { filters: {} }),
  ]);

  if (!summaryResult.error && summaryResult.data && typeof summaryResult.data === "object") {
    const payload = summaryResult.data as BinaDashboardSummary;
    return enrichDashboardSummaryWithTrust({
      ...payload,
      risks: Array.isArray(payload.risks) ? payload.risks : [],
      dataQuality: Array.isArray(payload.dataQuality) ? payload.dataQuality : [],
      financeByConfidence: Array.isArray(payload.financeByConfidence) ? payload.financeByConfidence : [],
      purchaseMetrics: Array.isArray(payload.purchaseMetrics) ? payload.purchaseMetrics : [],
      deliveryMetrics: Array.isArray(payload.deliveryMetrics) ? payload.deliveryMetrics : [],
    }, trustResult.error ? null : trustResult.data);
  }

  const [overview, sync, riskRows] = await Promise.all([
    fetchBinaOverview(),
    fetchBinaSyncStatus().catch(() => undefined),
    fetchBinaCrossDomainRisks({ limit: 12 }).catch(() => []),
  ]);

  return enrichDashboardSummaryWithTrust(
    fallbackDashboardSummary(overview, sync, riskRows),
    trustResult.error ? null : trustResult.data,
  );
}

export async function fetchBinaCrossDomainRisks(params: PageParams = {}): Promise<BinaRiskRow[]> {
  const supabase = createServiceSupabase();
  const limit = clampLimit(params.limit);
  const pattern = likePattern(params.search);

  let query = supabase
    .from("mart_bina_cross_domain_risk")
    .select("*")
    .order("risk_score", { ascending: false })
    .order("synced_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (pattern) {
    query = query.or(`entity_label.ilike.${pattern},entity_key.ilike.${pattern},risk_reason.ilike.${pattern},domain.ilike.${pattern}`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as BinaRiskRow[];
}

export async function fetchBinaProductionDashboard(): Promise<BinaProductionDashboard> {
  const supabase = createServiceSupabase();
  const rpcResult = await supabase.rpc("rpc_bina_production_dashboard", {
    filters: {
      limit: 1000,
    },
  });

  if (!rpcResult.error && rpcResult.data && typeof rpcResult.data === "object") {
    const payload = rpcResult.data as BinaProductionDashboard;
    return {
      coverage: (payload.coverage ?? {}) as BinaProductionDashboard["coverage"],
      coverageStatus: String(payload.coverageStatus ?? "partial_sample"),
      metrics: (payload.metrics ?? {}) as BinaProductionDashboard["metrics"],
      lanes: (payload.lanes ?? {}) as BinaProductionDashboard["lanes"],
      risks: Array.isArray(payload.risks) ? payload.risks : [],
      unmappedOperations: Array.isArray(payload.unmappedOperations) ? payload.unmappedOperations : [],
    };
  }

  const dashboardLimit = 1000;

  const [workOrdersResult, purchasingResult, deliveriesResult, coverageResult, unmappedResult] = await Promise.all([
    supabase
      .from("mart_bina_work_order_status")
      .select(WORK_ORDER_COLUMNS)
      .order("work_order_id", { ascending: false, nullsFirst: false })
      .limit(dashboardLimit),
    supabase
      .from("mart_bina_purchase_flow")
      .select(PURCHASING_COLUMNS)
      .not("work_order_id", "is", null)
      .limit(5000),
    supabase
      .from("mart_bina_delivery_status")
      .select(DELIVERY_COLUMNS)
      .not("work_order_id", "is", null)
      .limit(5000),
    supabase
      .from("bina_sync_log")
      .select("table_name,status,created_at,rows_upserted")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("mart_bina_unmapped_operations")
      .select("*")
      .order("row_count", { ascending: false })
      .limit(12),
  ]);

  if (workOrdersResult.error) throw new Error(workOrdersResult.error.message);

  const workOrders = (workOrdersResult.data ?? []) as unknown as BinaWorkOrderSummary[];
  const purchasing = purchasingResult.error ? [] : ((purchasingResult.data ?? []) as unknown as BinaPurchasingRow[]);
  const deliveries = deliveriesResult.error ? [] : ((deliveriesResult.data ?? []) as unknown as BinaDeliveryRow[]);
  const coverageRows = coverageResult.error ? [] : ((coverageResult.data ?? []) as AnyRecord[]);
  const unmappedOperations = unmappedResult.error ? [] : ((unmappedResult.data ?? []) as AnyRecord[]);

  const purchasingByWorkOrder = new Map<number, { requests: number; receipts: number; openQuantity: number; syncedAt: string | null }>();
  for (const row of purchasing) {
    if (row.work_order_id == null) continue;
    const current = purchasingByWorkOrder.get(row.work_order_id) ?? { requests: 0, receipts: 0, openQuantity: 0, syncedAt: null };
    if (row.flow_type === "purchase_request") {
      current.requests += 1;
      current.openQuantity += Number(row.remaining_quantity ?? 0);
    }
    if (row.flow_type === "goods_receipt") current.receipts += 1;
    if (!current.syncedAt || (row.synced_at && row.synced_at > current.syncedAt)) current.syncedAt = row.synced_at;
    purchasingByWorkOrder.set(row.work_order_id, current);
  }

  const deliveriesByWorkOrder = new Map<number, { total: number; sentOpen: number; syncedAt: string | null }>();
  for (const row of deliveries) {
    if (row.work_order_id == null) continue;
    const current = deliveriesByWorkOrder.get(row.work_order_id) ?? { total: 0, sentOpen: 0, syncedAt: null };
    current.total += 1;
    if (row.delivery_state === "sent_open") current.sentOpen += 1;
    if (!current.syncedAt || (row.synced_at && row.synced_at > current.syncedAt)) current.syncedAt = row.synced_at;
    deliveriesByWorkOrder.set(row.work_order_id, current);
  }

  const makeDecision = (
    order: BinaWorkOrderSummary,
    override?: {
      blocker_type: string;
      next_action_reason: string;
      owner_role: string;
      priority_score: number;
      purchase_request_count?: number;
      delivery_count?: number;
      evidence_synced_at?: string | null;
    },
  ): BinaWorkOrderDecisionFact => {
    let blocker_type = "ready_or_linked";
    let next_action_reason = "נראה מוכן או מקושר, בכפוף לאמון הנתונים";
    let owner_role = "production";
    let priority_score = 10;

    if (order.gestelit_job_id == null) {
      blocker_type = "missing_import";
      next_action_reason = "לא יובא לגסטליט";
      priority_score = 75;
    } else if (order.link_status === "quantity_mismatch") {
      blocker_type = "quantity_mismatch";
      next_action_reason = "פער כמות בין BINA לגסטליט";
      priority_score = 90;
    } else if (order.link_status === "at_risk") {
      blocker_type = "late_or_unfinished";
      next_action_reason = "תאריך אספקה עבר והייצור לא הושלם";
      priority_score = 70;
    } else if (Number(order.bina_production_row_count ?? 0) === 0) {
      blocker_type = "missing_route_rows";
      next_action_reason = "אין שורות מסלול/ייצור מ-BINA";
      owner_role = "system";
      priority_score = 40;
    }

    if (override) {
      blocker_type = override.blocker_type;
      next_action_reason = override.next_action_reason;
      owner_role = override.owner_role;
      priority_score = override.priority_score;
    }

    return {
      ...order,
      route_row_count: Number(order.bina_production_row_count ?? 0),
      route_source_table_count: null,
      route_machine_count: null,
      route_source_tables: null,
      route_machine_names: null,
      first_started_at: null,
      last_ended_at: null,
      purchase_request_count: override?.purchase_request_count ?? 0,
      goods_receipt_count: null,
      open_purchase_quantity: null,
      open_purchase_amount: null,
      delivery_count: override?.delivery_count ?? 0,
      sent_open_delivery_count: null,
      last_sent_at: null,
      finance_document_count: 0,
      receivable_open: null,
      payable_open: null,
      overdue_finance_count: null,
      invoice_count: null,
      sales_amount: null,
      unpaid_or_unknown_invoice_count: null,
      evidence_synced_at: override?.evidence_synced_at ?? order.synced_at,
      blocker_type,
      next_action_reason,
      owner_role,
      priority_score,
      relationship_confidence: order.gestelit_job_id ? "exact" : "inferred",
    };
  };

  const baseRows = workOrders.map((order) => makeDecision(order));
  const materialRows = workOrders.flatMap((order) => {
    if (order.work_order_id == null) return [];
    const purchase = purchasingByWorkOrder.get(order.work_order_id);
    if (!purchase || purchase.openQuantity <= 0) return [];
    return [
      makeDecision(order, {
        blocker_type: "material_or_purchase_open",
        next_action_reason: "יש רכש/כמות פתוחה שיכולה לחסום שיגור",
        owner_role: "purchasing",
        priority_score: 65,
        purchase_request_count: purchase.requests,
        evidence_synced_at: purchase.syncedAt,
      }),
    ];
  });
  const deliveryRows = workOrders.flatMap((order) => {
    if (order.work_order_id == null) return [];
    const delivery = deliveriesByWorkOrder.get(order.work_order_id);
    if (!delivery || delivery.sentOpen <= 0) return [];
    return [
      makeDecision(order, {
        blocker_type: "sent_open_delivery",
        next_action_reason: "משלוח יצא ועדיין פתוח",
        owner_role: "logistics",
        priority_score: 55,
        delivery_count: delivery.total,
        evidence_synced_at: delivery.syncedAt,
      }),
    ];
  });

  const dashboardRows = [...baseRows, ...materialRows, ...deliveryRows];
  const sortByPriority = (a: BinaWorkOrderDecisionFact, b: BinaWorkOrderDecisionFact) =>
    b.priority_score - a.priority_score || String(a.due_at ?? "9999").localeCompare(String(b.due_at ?? "9999"));

  const lane = (blocker: string) =>
    dashboardRows
      .filter((row) => row.blocker_type === blocker)
      .sort(sortByPriority)
      .slice(0, 8);

  const lastSyncedAt = coverageRows.reduce<string | null>((latest, row) => {
    const value = normalizeString(row.created_at);
    if (!value) return latest;
    return !latest || value > latest ? value : latest;
  }, null);

  return {
    coverage: {
      table_count: coverageRows.length,
      partial_tables: 1,
      stale_tables: 0,
      last_synced_at: lastSyncedAt,
      all_complete: false,
    },
    coverageStatus: "partial_sample",
    metrics: {
      work_order_count: workOrders.length,
      not_imported_count: workOrders.filter((row) => row.gestelit_job_id == null).length,
      quantity_mismatch_count: workOrders.filter((row) => row.link_status === "quantity_mismatch").length,
      at_risk_count: workOrders.filter((row) => row.link_status === "at_risk").length,
      material_blocked_count: materialRows.length,
      sent_open_delivery_count: deliveryRows.length,
      ready_or_linked_count: workOrders.filter((row) => row.link_status === "linked" && row.gestelit_job_id != null).length,
      missing_route_count: workOrders.filter((row) => Number(row.bina_production_row_count ?? 0) === 0).length,
      last_evidence_synced_at: lastSyncedAt,
      dashboard_sample_limit: dashboardLimit,
      dashboard_scope: "recent_work_orders",
    },
    lanes: {
      missing_import: lane("missing_import"),
      quantity_mismatch: lane("quantity_mismatch"),
      late_or_unfinished: lane("late_or_unfinished"),
      material_or_purchase_open: lane("material_or_purchase_open"),
      sent_open_delivery: lane("sent_open_delivery"),
      ready_or_linked: lane("ready_or_linked"),
    },
    risks: dashboardRows.filter((row) => row.priority_score >= 40).sort(sortByPriority).slice(0, 12),
    unmappedOperations,
  };
}

export async function fetchBinaWorkOrderDecisions(params: PageParams = {}) {
  const supabase = createServiceSupabase();
  const limit = clampLimit(params.limit);
  const offset = Math.max(0, params.offset ?? 0);
  const pattern = likePattern(params.search);

  let query = supabase
    .from("mart_bina_work_order_decision_facts")
    .select(WORK_ORDER_DECISION_COLUMNS, { count: "exact" })
    .order("priority_score", { ascending: false })
    .order("due_at", { ascending: true, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (pattern) {
    const numericSearch = normalizeNumber(params.search);
    const filters = [
      `customer_name.ilike.${pattern}`,
      `title.ilike.${pattern}`,
      `next_action_reason.ilike.${pattern}`,
      `blocker_type.ilike.${pattern}`,
    ];
    if (numericSearch !== null) filters.push(`work_order_id.eq.${numericSearch}`);
    query = query.or(filters.join(","));
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as unknown as BinaWorkOrderDecisionFact[], count: count ?? 0 };
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

  const { data: decision, error: decisionError } = await supabase
    .from("mart_bina_work_order_decision_facts")
    .select(WORK_ORDER_DECISION_COLUMNS)
    .eq("bina_id", binaId)
    .maybeSingle();

  if (decisionError) throw new Error(decisionError.message);

  const order = decision as unknown as BinaWorkOrderDecisionFact | null;
  const workOrderId = normalizeNumber(order?.work_order_id);
  const { data: productionRows, error: rowsError } = await supabase
    .from("stg_bina_production_rows")
    .select(PRODUCTION_ROW_COLUMNS)
    .eq("work_order_id", workOrderId ?? -1)
    .order("work_line_no", { ascending: true });

  if (rowsError) throw new Error(rowsError.message);

  const [purchasingResult, deliveriesResult, financeResult, salesResult] = await Promise.all([
    workOrderId ? fetchBinaPurchasing({ search: String(workOrderId), limit: 50 }) : Promise.resolve({ rows: [] as BinaPurchasingRow[], count: 0 }),
    workOrderId ? fetchBinaDeliveries({ search: String(workOrderId), limit: 50 }) : Promise.resolve({ rows: [] as BinaDeliveryRow[], count: 0 }),
    workOrderId ? fetchBinaFinance({ search: String(workOrderId), limit: 50 }) : Promise.resolve({ rows: [] as BinaFinanceRow[], count: 0 }),
    workOrderId ? fetchBinaSales({ search: String(workOrderId), limit: 50 }) : Promise.resolve({ rows: [] as BinaSalesRow[], count: 0 }),
  ]);

  return {
    order: (order as unknown as BinaWorkOrderDetail["order"]) ?? null,
    decision: order,
    productionRows: (productionRows ?? []) as unknown as BinaProductionRow[],
    relatedPurchasing: purchasingResult.rows,
    relatedDeliveries: deliveriesResult.rows,
    relatedFinance: financeResult.rows,
    relatedSales: salesResult.rows,
    routeSummary: {
      sourceTables: Array.isArray(order?.route_source_tables) ? order.route_source_tables : [],
      machineNames: Array.isArray(order?.route_machine_names) ? order.route_machine_names : [],
      rowCount: toCount(order?.route_row_count),
      machineCount: toCount(order?.route_machine_count),
      relationshipConfidence: order?.relationship_confidence ?? "missing_data",
    },
  };
}

export async function fetchBinaRouteSuggestions(params: PageParams & { workOrderId?: number | null } = {}) {
  const supabase = createServiceSupabase();
  const limit = clampLimit(params.limit);
  const offset = Math.max(0, params.offset ?? 0);
  const workOrderId = params.workOrderId ?? normalizeNumber(params.search);

  let query = supabase
    .from("mart_bina_route_suggestions")
    .select(ROUTE_SUGGESTION_COLUMNS, { count: "exact" })
    .order("synced_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (workOrderId !== null) {
    query = query.eq("work_order_id", workOrderId);
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as unknown as BinaRouteSuggestion[], count: count ?? 0 };
}

export async function fetchBinaMaterialReadiness(
  params: PageParams & { workOrderId?: number | null; materialState?: string | null } = {},
) {
  const supabase = createServiceSupabase();
  const limit = clampLimit(params.limit);
  const offset = Math.max(0, params.offset ?? 0);
  const workOrderId = params.workOrderId ?? normalizeNumber(params.search);

  let query = supabase
    .from("mart_bina_material_readiness")
    .select(MATERIAL_READINESS_COLUMNS, { count: "exact" })
    .order("short_or_unknown_item_count", { ascending: false })
    .order("purchase_requested_item_count", { ascending: false })
    .order("synced_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (workOrderId !== null) {
    query = query.eq("work_order_id", workOrderId);
  }

  if (params.materialState && params.materialState !== "all") {
    query = query.eq("material_state", params.materialState);
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as unknown as BinaMaterialReadinessRow[], count: count ?? 0 };
}

export async function fetchBinaWorkOrderOperationalProfile(params: {
  binaId?: string | null;
  workOrderId?: number | null;
  search?: string | null;
  limit?: number;
}): Promise<BinaWorkOrderOperationalProfile> {
  const limit = clampLimit(params.limit);
  const workOrderSearch = params.workOrderId ? String(params.workOrderId) : params.search ?? undefined;

  const baseDetail = params.binaId
    ? await fetchBinaWorkOrderDetail(params.binaId)
    : null;
  const fallbackOrders = baseDetail?.order
    ? { rows: [baseDetail.order], count: 1 }
    : await fetchBinaWorkOrders({ search: workOrderSearch, limit: Math.min(limit, 10) });
  const fallbackOrder = params.workOrderId
    ? fallbackOrders.rows.find((row) => row.work_order_id === params.workOrderId) ?? fallbackOrders.rows[0] ?? null
    : fallbackOrders.rows[0] ?? null;
  const detail = baseDetail ?? (fallbackOrder?.bina_id ? await fetchBinaWorkOrderDetail(fallbackOrder.bina_id) : null);
  const workOrder = detail?.order ?? fallbackOrder;
  const workOrderId = normalizeNumber(workOrder?.work_order_id);

  if (workOrderId === null) {
    return {
      workOrder: workOrder ?? null,
      decision: detail?.decision ?? null,
      route: null,
      material: null,
      productionRows: detail?.productionRows.slice(0, limit) ?? [],
      relatedPurchasing: [],
      relatedDeliveries: [],
      relatedFinance: [],
      relatedSales: [],
      operationalSignals: {
        workOrderId: null,
        materialState: "unknown",
        routeConfidence: "missing_data",
        relationshipConfidence: detail?.decision?.relationship_confidence ?? "missing_data",
        currentStationLabel: null,
        nextStationLabel: null,
        openPurchaseQuantity: 0,
        unmappedRouteSteps: 0,
        blockerType: detail?.decision?.blocker_type ?? null,
        nextActionReason: detail?.decision?.next_action_reason ?? null,
        ownerRole: detail?.decision?.owner_role ?? null,
        priorityScore: detail?.decision?.priority_score ?? null,
      },
    };
  }

  const [routeResult, materialResult, purchasingResult, deliveriesResult, financeResult, salesResult] = await Promise.all([
    fetchBinaRouteSuggestions({ workOrderId, limit: 1 }),
    fetchBinaMaterialReadiness({ workOrderId, limit: 1 }),
    detail ? Promise.resolve({ rows: detail.relatedPurchasing, count: detail.relatedPurchasing.length }) : fetchBinaPurchasing({ search: String(workOrderId), limit }),
    detail ? Promise.resolve({ rows: detail.relatedDeliveries, count: detail.relatedDeliveries.length }) : fetchBinaDeliveries({ search: String(workOrderId), limit }),
    detail ? Promise.resolve({ rows: detail.relatedFinance, count: detail.relatedFinance.length }) : fetchBinaFinance({ search: String(workOrderId), limit }),
    detail ? Promise.resolve({ rows: detail.relatedSales, count: detail.relatedSales.length }) : fetchBinaSales({ search: String(workOrderId), limit }),
  ]);

  const route = routeResult.rows[0] ?? null;
  const material = materialResult.rows[0] ?? null;

  return {
    workOrder: workOrder ?? null,
    decision: detail?.decision ?? null,
    route,
    material,
    productionRows: detail?.productionRows.slice(0, limit) ?? [],
    relatedPurchasing: purchasingResult.rows.slice(0, limit),
    relatedDeliveries: deliveriesResult.rows.slice(0, limit),
    relatedFinance: financeResult.rows.slice(0, limit),
    relatedSales: salesResult.rows.slice(0, limit),
    operationalSignals: {
      workOrderId,
      materialState: material?.material_state ?? "unknown",
      routeConfidence: route?.route_confidence ?? detail?.routeSummary.relationshipConfidence ?? "missing_data",
      relationshipConfidence: detail?.decision?.relationship_confidence ?? (workOrder?.gestelit_job_id ? "exact" : "inferred"),
      currentStationLabel: route?.current_station_label ?? null,
      nextStationLabel: route?.next_station_label ?? null,
      openPurchaseQuantity: toCount(material?.open_purchase_quantity ?? detail?.decision?.open_purchase_quantity),
      unmappedRouteSteps: toCount(route?.unmapped_step_count),
      blockerType: detail?.decision?.blocker_type ?? null,
      nextActionReason: detail?.decision?.next_action_reason ?? null,
      ownerRole: detail?.decision?.owner_role ?? null,
      priorityScore: detail?.decision?.priority_score ?? null,
    },
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

export async function fetchBinaFinance(params: BinaFinanceParams = {}) {
  const supabase = createServiceSupabase();
  const limit = clampLimit(params.limit);
  const offset = Math.max(0, params.offset ?? 0);
  const pattern = likePattern(params.search);
  const financeParams = params as BinaFinanceParams;

  let query = supabase
    .from("mart_bina_finance_transactions")
    .select(FINANCE_COLUMNS, { count: "exact" })
    .order("risk_score", { ascending: false })
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("document_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (financeParams.kind && financeParams.kind !== "all") {
    query = query.eq("kind", financeParams.kind);
  }

  if (financeParams.partyType && financeParams.partyType !== "all") {
    query = query.eq("party_type", financeParams.partyType);
  }

  if (financeParams.currency && financeParams.currency !== "all") {
    query = query.eq("currency_group", financeParams.currency);
  }

  if (financeParams.agingBucket && financeParams.agingBucket !== "all") {
    query = query.eq("aging_bucket", financeParams.agingBucket);
  }

  if (financeParams.dateQuality && financeParams.dateQuality !== "all") {
    query = query.eq("date_quality", financeParams.dateQuality);
  }

  if (financeParams.dateFrom) query = query.gte("document_at", financeParams.dateFrom);
  if (financeParams.dateTo) query = query.lte("document_at", financeParams.dateTo);
  if (financeParams.dueFrom) query = query.gte("due_at", financeParams.dueFrom);
  if (financeParams.dueTo) query = query.lte("due_at", financeParams.dueTo);

  if (typeof financeParams.minAmount === "number") query = query.gte("total_amount", financeParams.minAmount);
  if (typeof financeParams.maxAmount === "number") query = query.lte("total_amount", financeParams.maxAmount);

  if (normalizeBoolean(financeParams.openOnly)) {
    query = query.gt("open_amount", 0);
  }

  if (normalizeBoolean(financeParams.overdueOnly)) {
    query = query
      .eq("date_quality", "valid")
      .gt("open_amount", 0)
      .lt("due_at", new Date().toISOString());
  }

  if (pattern) {
    const numericSearch = normalizeNumber(params.search);
    const filters = [
      `document_no.ilike.${pattern}`,
      `party_name.ilike.${pattern}`,
      `currency_group.ilike.${pattern}`,
      `kind.ilike.${pattern}`,
      `document_type_label.ilike.${pattern}`,
      `salesperson.ilike.${pattern}`,
      `risk_reason.ilike.${pattern}`,
    ];
    if (numericSearch !== null) {
      filters.push(
        `party_code.eq.${numericSearch}`,
        `related_work_order_id.eq.${numericSearch}`,
        `related_delivery_no.eq.${numericSearch}`,
        `related_goods_receipt_no.eq.${numericSearch}`,
      );
    }
    query = query.or(
      filters.join(","),
    );
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as unknown as BinaFinanceRow[], count: count ?? 0 };
}

export async function fetchBinaFinanceSummary(): Promise<BinaFinanceSummary> {
  const supabase = createServiceSupabase();

  const [summaryResult, agingResult, exceptionsResult] = await Promise.all([
    supabase.from("mart_bina_finance_summary").select("*").order("currency_group"),
    supabase.from("mart_bina_finance_aging").select("*").order("currency_group").order("finance_direction").order("aging_bucket"),
    supabase.from("mart_bina_finance_exceptions").select(FINANCE_COLUMNS).limit(12),
  ]);

  if (summaryResult.error) throw new Error(summaryResult.error.message);
  if (agingResult.error) throw new Error(agingResult.error.message);
  if (exceptionsResult.error) throw new Error(exceptionsResult.error.message);

  const currencies = (summaryResult.data ?? []).map((row) => ({
    currency_group: String(row.currency_group ?? "ILS"),
    document_count: toCount(row.document_count),
    customer_invoice_count: toCount(row.customer_invoice_count),
    supplier_invoice_count: toCount(row.supplier_invoice_count),
    debt_count: toCount(row.debt_count),
    suspicious_date_count: toCount(row.suspicious_date_count),
    receivable_total: toCount(row.receivable_total),
    receivable_open: toCount(row.receivable_open),
    receivable_overdue: toCount(row.receivable_overdue),
    supplier_invoice_total: toCount(row.supplier_invoice_total),
    payable_open: toCount(row.payable_open),
    payable_overdue: toCount(row.payable_overdue),
    due_this_week: toCount(row.due_this_week),
    last_synced_at: normalizeString(row.last_synced_at),
  }));

  const primaryCurrencyRow = currencies.find((row) => row.currency_group === "ILS") ?? currencies[0];
  const totals = primaryCurrencyRow
    ? {
        documentCount: primaryCurrencyRow.document_count,
        customerInvoiceCount: primaryCurrencyRow.customer_invoice_count,
        supplierInvoiceCount: primaryCurrencyRow.supplier_invoice_count,
        debtCount: primaryCurrencyRow.debt_count,
        suspiciousDateCount: currencies.reduce((sum, row) => sum + row.suspicious_date_count, 0),
        receivableOpen: primaryCurrencyRow.receivable_open,
        receivableOverdue: primaryCurrencyRow.receivable_overdue,
        payableOpen: primaryCurrencyRow.payable_open,
        payableOverdue: primaryCurrencyRow.payable_overdue,
        dueThisWeek: primaryCurrencyRow.due_this_week,
      }
    : {
        documentCount: 0,
        customerInvoiceCount: 0,
        supplierInvoiceCount: 0,
        debtCount: 0,
        suspiciousDateCount: 0,
        receivableOpen: 0,
        receivableOverdue: 0,
        payableOpen: 0,
        payableOverdue: 0,
        dueThisWeek: 0,
      };

  return {
    asOf: new Date().toISOString(),
    primaryCurrency: primaryCurrencyRow?.currency_group ?? "ILS",
    currencies,
    totals,
    aging: (agingResult.data ?? []).map((row) => ({
      currency_group: String(row.currency_group ?? "ILS"),
      finance_direction: String(row.finance_direction ?? "payable") as BinaFinanceAgingBucket["finance_direction"],
      party_type: String(row.party_type ?? "supplier") as BinaFinanceAgingBucket["party_type"],
      aging_bucket: String(row.aging_bucket ?? "לא רלוונטי"),
      document_count: toCount(row.document_count),
      open_amount: toCount(row.open_amount),
      last_synced_at: normalizeString(row.last_synced_at),
    })),
    exceptions: (exceptionsResult.data ?? []) as unknown as BinaFinanceRow[],
  };
}

export async function fetchBinaFinanceDetail(binaId: string, kind?: string | null): Promise<BinaFinanceDetail> {
  const supabase = createServiceSupabase();

  let transactionQuery = supabase
    .from("mart_bina_finance_transactions")
    .select(FINANCE_COLUMNS)
    .eq("bina_id", binaId)
    .limit(1);

  if (kind) transactionQuery = transactionQuery.eq("kind", kind);

  const { data: transactionRows, error: transactionError } = await transactionQuery;
  if (transactionError) throw new Error(transactionError.message);
  const transaction = ((transactionRows ?? [])[0] ?? null) as unknown as BinaFinanceRow | null;

  if (!transaction) {
    return {
      transaction: null,
      customerInvoiceLines: [],
      supplierInvoiceLines: [],
      relatedSales: [],
      relatedDeliveries: [],
      relatedWorkOrders: [],
      relatedPurchasing: [],
      relatedSuppliers: [],
    };
  }

  const relatedSearch = transaction.party_name ?? transaction.document_no ?? undefined;
  const [customerLinesResult, supplierLinesResult, salesResult, deliveriesResult, workOrdersResult, purchasingResult, suppliersResult] = await Promise.all([
    transaction.kind === "customer_invoice"
      ? supabase.from("stg_bina_customer_invoice_lines").select("*").eq("bina_id", transaction.bina_id).limit(100)
      : Promise.resolve({ data: [], error: null }),
    transaction.party_type === "supplier" && transaction.party_code
      ? supabase.from("stg_bina_supplier_invoice_lines").select("*").eq("supplier_code", transaction.party_code).limit(100)
      : Promise.resolve({ data: [], error: null }),
    transaction.related_work_order_id || transaction.document_no
      ? fetchBinaSales({ search: String(transaction.related_work_order_id ?? transaction.document_no), limit: 20 })
      : Promise.resolve({ rows: [] as BinaSalesRow[], count: 0 }),
    transaction.related_delivery_no || transaction.related_work_order_id
      ? fetchBinaDeliveries({ search: String(transaction.related_delivery_no ?? transaction.related_work_order_id), limit: 20 })
      : Promise.resolve({ rows: [] as BinaDeliveryRow[], count: 0 }),
    transaction.related_work_order_id
      ? fetchBinaWorkOrders({ search: String(transaction.related_work_order_id), limit: 20 })
      : Promise.resolve({ rows: [] as BinaWorkOrderSummary[], count: 0 }),
    relatedSearch
      ? fetchBinaPurchasing({ search: relatedSearch, limit: 20 })
      : Promise.resolve({ rows: [] as BinaPurchasingRow[], count: 0 }),
    transaction.party_type === "supplier" && transaction.party_name
      ? fetchBinaSuppliers({ search: transaction.party_name, limit: 20 })
      : Promise.resolve({ rows: [] as BinaSupplierSummary[], count: 0 }),
  ]);

  if (customerLinesResult.error) throw new Error(customerLinesResult.error.message);
  if (supplierLinesResult.error) throw new Error(supplierLinesResult.error.message);

  return {
    transaction,
    customerInvoiceLines: (customerLinesResult.data ?? []) as AnyRecord[],
    supplierInvoiceLines: (supplierLinesResult.data ?? []) as AnyRecord[],
    relatedSales: salesResult.rows,
    relatedDeliveries: deliveriesResult.rows,
    relatedWorkOrders: workOrdersResult.rows,
    relatedPurchasing: purchasingResult.rows,
    relatedSuppliers: suppliersResult.rows,
  };
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

  const [metricTrustResult, logsResult, qualityResult] = await Promise.all([
    supabase.from("mart_bina_metric_trust").select("*").order("domain").order("source_table"),
    supabase.from("bina_sync_log").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("mart_bina_data_quality").select("*").order("severity", { ascending: false }).order("affected_count", { ascending: false }),
  ]);

  if (logsResult.error) throw new Error(logsResult.error.message);

  if (!metricTrustResult.error && (metricTrustResult.data ?? []).length > 0) {
    const metricTrustRows = (metricTrustResult.data ?? []) as AnyRecord[];
    const tables = metricTrustRows.map((row) => ({
      source_table: String(row.source_table ?? ""),
      storage_table: String(row.storage_table ?? ""),
      row_count: toCount(row.upserted_count ?? row.sent_count),
      last_row_synced_at: normalizeString(row.last_table_sync_at),
      age_seconds: normalizeNumber(row.age_seconds),
      freshness_status: String(row.freshness_status ?? "empty"),
    }));

    const coverage = metricTrustRows.map((row) => ({
      source_table: String(row.source_table ?? ""),
      storage_table: String(row.storage_table ?? ""),
      row_count: toCount(row.upserted_count ?? row.sent_count),
      last_row_synced_at: normalizeString(row.last_table_sync_at),
      age_seconds: normalizeNumber(row.age_seconds),
      freshness_status: String(row.freshness_status ?? "empty"),
      sync_scope: String(row.sync_scope ?? "recent_window"),
      source_row_count: null,
      source_min_id: normalizeString(row.source_min_key),
      source_max_id: normalizeString(row.source_max_key),
      source_min_date: normalizeString(row.source_min_date),
      source_max_date: normalizeString(row.source_max_date),
      is_complete_snapshot: normalizeBoolean(row.supports_full_snapshot),
      sample_limited: !normalizeBoolean(row.supports_full_snapshot),
      coverage_status: String(row.coverage_status ?? "partial_sample"),
      coverage_note: normalizeString(row.trust_note) ?? "Recent-window sync only; use as operational signal, not executive total.",
      domain: normalizeString(row.domain),
      grain: normalizeString(row.grain),
      trust_note: normalizeString(row.trust_note),
    })) as BinaSyncCoverageRow[];

    return {
      tables,
      coverage,
      dataQuality: qualityResult.error ? undefined : (qualityResult.data ?? []) as BinaDataQualityIssue[],
      logs: (logsResult.data ?? []) as BinaSyncStatus["logs"],
    };
  }

  const [tablesResult, coverageResult] = await Promise.all([
    supabase.from("mart_bina_sync_health").select("*").order("source_table"),
    supabase.from("mart_bina_sync_coverage").select("*").order("source_table"),
  ]);

  if (tablesResult.error) throw new Error(tablesResult.error.message);

  return {
    tables: (tablesResult.data ?? []) as BinaSyncStatus["tables"],
    coverage: coverageResult.error ? undefined : (coverageResult.data ?? []) as BinaSyncCoverageRow[],
    dataQuality: qualityResult.error ? undefined : (qualityResult.data ?? []) as BinaDataQualityIssue[],
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
