/** A closed query language: the model supplies data, never executable SQL. Admin only. */
export const analyticsDatasets = {
  work_orders: { view: "mart_bina_work_order_status", columns: ["work_order_id", "customer_name", "customer_code", "title", "status_text", "bina_quantity", "created_at", "due_at", "synced_at", "link_status", "gestelit_planned_quantity", "gestelit_completed_good"], numeric: ["bina_quantity", "gestelit_planned_quantity", "gestelit_completed_good"] },
  purchasing: { view: "mart_bina_purchase_flow", columns: ["flow_type", "document_no", "work_order_id", "supplier_code", "supplier_name", "item_code", "item_name", "quantity", "remaining_quantity", "currency", "document_at", "synced_at"], numeric: ["quantity", "remaining_quantity"] },
  deliveries: { view: "mart_bina_delivery_status", columns: ["delivery_no", "customer_name", "customer_code", "delivery_at", "sent_at", "work_order_id", "invoice_no", "delivery_state", "synced_at"], numeric: [] },
  finance: { view: "mart_bina_finance_transactions", columns: ["kind", "finance_direction", "party_type", "document_no", "party_name", "document_at", "due_at", "total_amount", "open_amount", "currency", "paid_status", "balance_confidence", "related_work_order_id", "synced_at"], numeric: ["total_amount", "open_amount"] },
} as const;
export type AnalyticsPlan = {
  dataset: keyof typeof analyticsDatasets;
  columns?: string[];
  groupBy?: string[];
  measures?: Array<{ op: "count" | "sum" | "avg" | "min" | "max"; column?: string }>;
  filters?: Array<{ column: string; op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "is_null"; value?: string | number | boolean }>;
  orderBy?: { column: string; direction: "asc" | "desc" };
  limit?: number;
};
function invalid(): never { throw new Error("AI_QUERY_PLAN_INVALID"); }
function object(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function keys(value: Record<string, unknown>, allowed: string[]) { if (Object.keys(value).some((key) => !allowed.includes(key))) invalid(); }
type Dataset = { view: string; columns: readonly string[]; numeric: readonly string[] };
export function validateAnalyticsPlan(value: unknown, role: "admin" | "sales"): AnalyticsPlan {
  if (role !== "admin") throw new Error("AI_QUERY_SCOPE_FORBIDDEN");
  return validateClosedPlan(value, analyticsDatasets) as AnalyticsPlan;
}
function validateClosedPlan(value: unknown, datasets: Record<string, Dataset>) {
  if (!object(value)) invalid();
  keys(value, ["dataset", "columns", "groupBy", "measures", "filters", "orderBy", "limit"]);
  if (typeof value.dataset !== "string" || !Object.hasOwn(datasets, value.dataset)) invalid();
  const dataset = datasets[value.dataset];
  const field = (column: unknown) => { if (typeof column !== "string" || !(dataset.columns as readonly string[]).includes(column)) invalid(); return column; };
  for (const name of ["columns", "groupBy"] as const) {
    if (value[name] !== undefined && (!Array.isArray(value[name]) || (value[name].length > 8 || (name === "columns" && value[name].length === 0)))) invalid();
    (value[name] as unknown[] | undefined)?.forEach(field);
  }
  if (value.measures !== undefined && (!Array.isArray(value.measures) || !value.measures.length || value.measures.length > 4)) invalid();
  (value.measures as unknown[] | undefined)?.forEach((measure) => {
    if (!object(measure)) invalid(); keys(measure, ["op", "column"]);
    if (!["count", "sum", "avg", "min", "max"].includes(String(measure.op))) invalid();
    if (measure.op === "count") { if (measure.column !== undefined) invalid(); }
    else if (!(dataset.numeric as readonly string[]).includes(field(measure.column))) invalid();
    if (value.dataset === "sales_activity" && measure.op !== "count" && !(value.groupBy as string[] | undefined)?.includes("currency")) invalid();
    if (value.dataset === "finance" && measure.op !== "count" && !["currency", "kind", "balance_confidence"].every((column) => (value.groupBy as string[] | undefined)?.includes(column))) invalid();
  });
  if (value.columns && value.measures) invalid();
  if (value.groupBy && !value.measures) invalid();
  if (value.filters !== undefined && (!Array.isArray(value.filters) || value.filters.length > 8)) invalid();
  (value.filters as unknown[] | undefined)?.forEach((filter) => {
    if (!object(filter)) invalid(); keys(filter, ["column", "op", "value"]); field(filter.column);
    if (!["eq", "neq", "gt", "gte", "lt", "lte", "contains", "is_null"].includes(String(filter.op))) invalid();
    if (filter.op === "is_null") { if (filter.value !== undefined) invalid(); }
    else if (!["string", "number", "boolean"].includes(typeof filter.value) || String(filter.value).length > 300 || (typeof filter.value === "number" && !Number.isFinite(filter.value))) invalid();
  });
  if (value.limit !== undefined && (!Number.isInteger(value.limit) || Number(value.limit) < 1 || Number(value.limit) > 200)) invalid();
  if (value.orderBy !== undefined) {
    if (!object(value.orderBy)) invalid(); keys(value.orderBy, ["column", "direction"]);
    const outputs = value.measures ? [...(value.groupBy as string[] ?? []), ...(value.measures as unknown[]).map((_, i) => `m${i}`)] : (value.columns as string[] ?? [...dataset.columns]);
    if (!outputs.includes(String(value.orderBy.column)) || !["asc", "desc"].includes(String(value.orderBy.direction))) invalid();
  }
  return value as AnalyticsPlan;
}
export const analyticsQueryTool = {
  type: "function" as const,
  name: "query_analytics",
  description: `Answer ad hoc natural-language comparisons with a validated query plan compiled to bounded read-only SELECT. Admin only. Datasets and columns: ${JSON.stringify(analyticsDatasets)}. Measures get output names m0,m1,... . count takes no column. Other measures require numeric columns. Finance amounts MUST group by currency, kind, balance_confidence. Source scan is limited to 20000 unranked rows; results are cache/sample facts, never company totals. If sourceTruncated is true, requested top/latest/ranking applies only within that unranked sample and cannot establish a global top or latest. No joins, expressions, custom SQL, functions or writes. Call metric trust too when interpreting coverage.`,
  parameters: { type: "object", properties: {
    dataset: { type: "string", enum: Object.keys(analyticsDatasets) },
    columns: { type: "array", items: { type: "string" }, maxItems: 8 },
    groupBy: { type: "array", items: { type: "string" }, maxItems: 8 },
    measures: { type: "array", items: { type: "object", properties: { op: { type: "string", enum: ["count", "sum", "avg", "min", "max"] }, column: { type: "string" } }, required: ["op"], additionalProperties: false }, maxItems: 4 },
    filters: { type: "array", items: { type: "object", properties: { column: { type: "string" }, op: { type: "string", enum: ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "is_null"] }, value: { type: ["string", "number", "boolean"] } }, required: ["column", "op"], additionalProperties: false }, maxItems: 8 },
    orderBy: { type: "object", properties: { column: { type: "string" }, direction: { type: "string", enum: ["asc", "desc"] } }, required: ["column", "direction"], additionalProperties: false },
    limit: { type: "integer", minimum: 1, maximum: 200 },
  }, required: ["dataset"], additionalProperties: false },
};

export const salesAnalyticsDataset = {
  sales_activity: { view: "mart_sales_activity_scoped", columns: ["id", "event_type", "event_at", "salesperson", "customer_name", "customer_code", "next_action_date", "estimated_revenue", "actual_revenue", "currency", "status", "customer_group", "area", "account_manager", "dormancy_bucket", "coverage_scope", "is_complete_contact_history", "updated_at"], numeric: ["estimated_revenue", "actual_revenue"] },
} as const;
export type SalesAnalyticsPlan = Omit<AnalyticsPlan, "dataset"> & { dataset: "sales_activity" };
export function validateSalesAnalyticsPlan(value: unknown): SalesAnalyticsPlan {
  if (!object(value) || value.dataset !== "sales_activity") throw new Error("AI_QUERY_SCOPE_FORBIDDEN");
  return validateClosedPlan(value, salesAnalyticsDataset) as unknown as SalesAnalyticsPlan;
}
export const salesAnalyticsQueryTool = {
  ...analyticsQueryTool,
  name: "query_sales_activity",
  description: `Query the authenticated viewer's allowed Gestelit sales activity with a fresh question-specific JSON plan, compiled into read-only bounded SQL. Server enforces personal/team scope; never supply user IDs or permissions. Dataset fields: ${JSON.stringify(salesAnalyticsDataset)}. count has no column; other measures only numeric fields and must group by currency. Measure aliases m0,m1. Respect screen filters unless user requests otherwise. Queries cover recorded Gestelit activity only, not complete BINA contact history. If sourceTruncated is true, requested top/latest/ranking applies only within the unranked bounded sample and cannot establish a global top or latest. No free-form SQL, joins, credentials, custom functions or writes.`,
  parameters: { ...analyticsQueryTool.parameters, properties: { ...analyticsQueryTool.parameters.properties, dataset: { type: "string", enum: ["sales_activity"] } } },
};
