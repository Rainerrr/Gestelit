import { BINA_OPERATIONAL_START } from "@/lib/bina/operational-scope";
import {fetchProcurementAnalysis,procurementSearchFeedback} from "@/lib/data/operations";
import {fetchMaintenanceStations} from "@/lib/data/maintenance";
import {createServiceSupabase} from "@/lib/supabase/client";
import { fetchActiveJobsWithProgress } from "@/lib/data/admin-dashboard";
import { fetchBinaWeekly } from "@/lib/data/bina-weekly";
import { buildOverview, israelDate } from "@/lib/manufacturing/overview";
import { analyticsQueryTool } from "@/lib/ai/query/plan";
import { runAnalyticsQuery } from "@/lib/ai/query/execute";
import { selectMetricTrust } from "@/lib/ai/metric-trust";
import {
  fetchSalesActivities,
  fetchSalesClients,
  fetchSalesSummary,
} from "@/lib/data/sales-log";
import {
  fetchBinaCrossDomainRisks,
  fetchBinaDashboardSummary,
  fetchBinaDeliveries,
  fetchBinaFinance,
  fetchBinaMaterialReadiness,
  fetchBinaOverview,
  fetchBinaPurchasing,
  fetchBinaSales,
  fetchBinaSuppliers,
  fetchBinaSyncStatus,
  fetchBinaWorkOrderDetail,
  fetchBinaWorkOrderOperationalProfile,
  fetchBinaWorkOrders,
} from "@/lib/data/bina";
import { fetchAvailableMetrics } from "@/lib/ai/semantic-catalog";
import { sanitizeToolText } from "@/lib/ai/safety";

export type AiToolResult = {
  name: string;
  data: unknown;
  rowCount: number;
  sources: string[];
  citations?: AiToolCitation[];
  freshness?: string | null;
};

export type AiToolCitation = {
  source_view: string;
  grain: string;
  key: string;
  label: string;
  synced_at: string | null;
  confidence: "exact" | "inferred" | "missing_data";
  fields_used: string[];
};

type ToolArgs = Record<string, unknown>;

function numberArg(args: ToolArgs, key: string, fallback: number) {
  const value = args[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function stringArg(args: ToolArgs, key: string) {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

function citationFromRow(source: string, row: Record<string, unknown>, index: number): AiToolCitation {
  const key = String(row.bina_id ?? row.id ?? row.risk_id ?? row.document_no ?? row.work_order_id ?? row.supplier_code ?? row.delivery_no ?? row.invoice_no ?? index);
  const confidence = row.confidence ?? row.balance_confidence ?? row.material_confidence ?? row.route_confidence ?? row.relationship_confidence;
  return {
    source_view: source,
    grain: String(row.kind ?? row.entity_type ?? row.flow_type ?? row.domain ?? (row.work_order_id ? "work_order" : "row")),
    key,
    label: String(row.entity_label ?? row.party_name ?? row.customer_name ?? row.supplier_name ?? row.item_name ?? row.title ?? row.current_station_label ?? row.next_station_label ?? row.document_no ?? row.work_order_id ?? key),
    synced_at: typeof row.synced_at === "string" ? row.synced_at : typeof row.last_synced_at === "string" ? row.last_synced_at : typeof row.updated_at === "string" ? row.updated_at : null,
    confidence: confidence === "exact"
      ? "exact"
      : confidence === "missing_data"
      ? "missing_data"
      : "inferred",
    fields_used: Object.keys(row).filter((field) => row[field] !== null && row[field] !== undefined).slice(0, 12),
  };
}

function citationsFromRows(source: string, rows: unknown[]): AiToolCitation[] {
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)))
    .slice(0, 20)
    .map((row, index) => citationFromRow(source, row, index));
}

function rowsResult(name: string, rows: unknown[], sources: string[], freshness?: string | null): AiToolResult {
  const citations = citationsFromRows(sources[0] ?? name, rows);
  return {
    name,
    data: sanitizeToolText(rows),
    rowCount: rows.length,
    sources,
    citations,
    freshness: freshness ?? citations.reduce<string | null>((latest, row) =>
      row.synced_at && (!latest || row.synced_at > latest) ? row.synced_at : latest, null),
  };
}

export const aiToolDefinitions = [
  {type:"function" as const,name:"get_procurement_analysis",description:"Read verified supplier-invoice lines grouped by quarter, exact item code AND description, unit, currency, and supplier. Default last 24 months. Use for paper/material purchasing history and quarterly supplier-price comparisons. Never compare different items/units/currencies or unknown units/currencies. Weighted unit_price is historical recorded price, not an approved current quote. Quarterly baseline = positive purchased quantity / days * 91.3125; excludes returns, does not account for stock, open orders, seasonality or demand, never an automatic purchase recommendation. For screen-wide totals plus an item example, query the screen filters first and query the item separately if needed. appliedFilters defines the scope of ALL counts; never label item-filtered counts as screen totals. sourceRows covers financial/coded joined invoice lines only; coverage.excludedNonFinancialLines counts blank/underscore-code rows with zero/missing quantity, price and amount, excluded as annotations, not missing purchases; result groups may be truncated. Do not sum currencies or treat supplier invoice lines as receipt headers. Narrow search when output is truncated. search is a SINGLE LITERAL SUBSTRING in the source language, e.g. נייר; never use OR, AND, regex or SQL syntax. Coverage contracts for BakashaNigrar/Tovin do not describe these HeshSapak supplier invoices.",parameters:{type:"object",properties:{from:{type:"string",description:"YYYY-MM-DD"},to:{type:"string",description:"YYYY-MM-DD"},search:{type:"string"}},additionalProperties:false}},
  {type:"function" as const,name:"get_operations_workspace",description:"Read management tasks including completed tasks, manually maintained subcontractor capabilities/price lists and station maintenance schedules. Optional search filters task title, responsible person or details. No writes or notifications. Price list entries may be expired; check valid_until and currency. Named responsibility is a task assignment label, not authorization. Compressor maintenance appears only if configured in stations. Never infer completed service from a planned date.",parameters:{type:"object",properties:{search:{type:"string",description:"Optional task title, owner or detail search"}},additionalProperties:false}},
  {
    type: "function" as const,
    name: "get_bina_weekly_snapshot",
    description: "Read a seven-day BINA snapshot for incoming work orders (receipt date TarikKabala, NOT the often-null created_at), purchasing by document date, and station routes for those incoming orders. Default previous Sunday-Saturday in Israel. Fully paginated synced cache for the week, source coverage still partial. Station rows/unique jobs are route evidence, NOT total weekly output, current station occupancy, or bottlenecks. datedCompleteRows counts route rows with a recorded end date in the period, not produced units. reportedCompleteRows counts current status code 2, not necessarily completed during that week. missingPurchaseDateCount counts purchasing rows without document dates across the cache, excluded from weekly totals; do not call their absence zero purchase requests. purchaseSuppliers contains exact precomputed per-supplier document counts and linked job IDs; use these, never manually recount row arrays. No monetary totals or stock availability inference. Use first for BINA weekly/incoming-order and associated station questions.",
    parameters: { type: "object", properties: { start: { type: "string", description: "Inclusive first business date YYYY-MM-DD; range is exactly 7 days." } }, additionalProperties: false },
  },
  analyticsQueryTool,
  {
    type: "function" as const,
    name: "get_gestelit_manufacturing_overview",
    description: "Read the actual Gestelit manufacturing overview: open jobs including those without active worker sessions, due dates, missing setup, cumulative terminal good/scrap, and per-product station routes. Use FIRST for Gestelit manufacturing overview/job queue questions; this is distinct from the partial BINA ERP cache. Active-session counts do not establish production or stoppage. Old demo/test records may be present.",
    parameters: { type: "object", properties: { search: { type: "string" }, limit: { type: "number" } }, additionalProperties: false },
  },
  {
    type: "function" as const,
    name: "get_bina_dashboard_summary",
    description: "Get aggregate-backed BINA BI dashboard summary with coverage status, data quality, finance confidence, purchase metrics, delivery metrics, and cross-domain risk queue.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_operational_overview",
    description: "Get a broad operational overview across BINA sync, production risk, purchasing, suppliers, sales, and deliveries.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_cross_domain_risk_map",
    description: "Run a broad cross-domain comparison across work orders, purchasing, suppliers, finance, sales, deliveries, and sync health to find operational risks and next actions.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_bina_sync_health",
    description: "Get BINA sync freshness, stale tables, recent logs, and per-table row counts.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_metric_trust",
    description: "Get BINA metric trust and coverage status by source table/domain, including partial sample, stale, blocked, and known data gaps. Use before making executive or cross-domain conclusions.",
    parameters: {
      type: "object",
      properties: {
        domain: { type: "string", enum: ["overview", "production", "purchasing", "suppliers", "finance", "sales", "deliveries", "sync"] },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_available_metrics",
    description: "List approved semantic metrics and their source views.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_recent_bina_changes",
    description: "Get latest available synced rows and freshness signals to explain what changed recently in BINA.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "explain_data_coverage",
    description: "Explain which BINA/semantic domains are currently mapped, partially mapped, or missing.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_new_bina_job_candidates",
    description: "Use for choosing or suggesting a NEW manufacturing job from BINA. Returns latest open, not-yet-linked orders since November 2024, newest receipt date first. Not being imported is normal during onboarding, never a backlog or risk. Review route, files and materials before starting.",
    parameters: { type: "object", properties: { limit: { type: "number" } }, additionalProperties: false },
  },
  {
    type: "function" as const,
    name: "get_late_or_risky_work_orders",
    description: "Get linked operational work orders since November 2024 with late or quantity-mismatch issues. Unimported BINA orders are not risks.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "compare_bina_order_to_gestelit_job",
    description: "Compare BINA orders to Gestelit jobs and return mismatches, missing imports, quantities, and progress signals.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_floor_progress_for_bina_order",
    description: "Get floor progress and production rows for one BINA work order by bina_id.",
    parameters: {
      type: "object",
      properties: {
        bina_id: { type: "string" },
      },
      required: ["bina_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "search_bina_work_orders",
    description: "Search BINA work orders by customer, title, or order reference, newest work-order number first.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_bina_work_order",
    description: "Get a BINA work order detail by bina_id.",
    parameters: {
      type: "object",
      properties: {
        bina_id: { type: "string" },
      },
      required: ["bina_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_purchase_kpis",
    description: "Get purchasing overview, open request lines, supplier totals, and BINA overview KPIs.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_material_blockers",
    description: "Find likely material/purchasing blockers from open purchase rows, remaining quantities, and risky production orders.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_material_readiness",
    description: "Get bounded material readiness by work order from mart_bina_material_readiness, including required items, stock/purchase signals, confidence, trust note, and typed evidence lines.",
    parameters: {
      type: "object",
      properties: {
        work_order_id: { type: "number" },
        material_state: { type: "string" },
        search: { type: "string" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_work_order_operational_profile",
    description: "Get a typed operational profile for one BINA work order using work-order status, mart_bina_material_readiness, mart_bina_route_suggestions, production rows, purchasing, delivery, sales, and finance evidence.",
    parameters: {
      type: "object",
      properties: {
        work_order_id: { type: "number" },
        bina_id: { type: "string" },
        search: { type: "string" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_purchase_flow_for_work_order",
    description: "Get purchasing, delivery, and order context for a specific work order number.",
    parameters: {
      type: "object",
      properties: {
        work_order_id: { type: "number" },
      },
      required: ["work_order_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_open_purchase_requests",
    description: "Get open purchase request lines with remaining quantities.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "search_purchase_lines",
    description: "Search BINA purchasing rows and goods receipts.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_supplier_summary",
    description: "Get a broad supplier summary including balances and recent purchasing rows.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_supplier_aging",
    description: "Get supplier balances. Use sort_by=open_balance for largest total open balances; use overdue_balance for largest overdue balances. Missing currencies must remain unknown.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        sort_by: { type: "string", enum: ["open_balance", "overdue_balance"] },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_supplier_late_deliveries",
    description: "Get supplier-related open deliveries and stale purchasing rows that may indicate late commitments.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_customer_summary",
    description: "Get broad customer/sales/delivery summary rows for a customer search term.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_supplier_invoice_summary",
    description: "Get supplier invoices and debt rows from BINA finance data.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_open_debts",
    description: "Get finance rows including open supplier debts and invoices.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_delivery_status",
    description: "Get delivery rows. For deliveries actually sent but still open, pass delivery_state=sent_open. draft_or_unknown is NOT evidence of dispatch or an open shipment. Empty results describe only the partial cache.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        delivery_state: { type: "string", enum: ["sent_open", "draft_or_unknown", "returned_or_received"] },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_sales_invoice_summary",
    description: "Get BINA customer invoice/sales summary rows.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_sales_activity_log",
    description: "Get Gestelit manual sales activity logs, including calls, meetings, leads, sales notes, AI summaries, and follow-ups.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        status: { type: "string" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_sales_followups_due",
    description: "Get manual sales follow-ups that are due or overdue today.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_sales_client_activity",
    description: "Get combined BINA invoice revenue and Gestelit manual sales activity by client.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_order_risk_evidence",
    description: "Get deterministic evidence for one BINA work order, including work-order detail, production rows, purchasing, delivery, sales, and finance links where keys exist.",
    parameters: {
      type: "object",
      properties: {
        work_order_id: { type: "number" },
      },
      required: ["work_order_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_supplier_evidence",
    description: "Get deterministic evidence for one supplier by supplier_code, including supplier aging, purchase rows, finance rows, and link confidence.",
    parameters: {
      type: "object",
      properties: {
        supplier_code: { type: "number" },
        search: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_invoice_evidence",
    description: "Get deterministic evidence for one invoice or finance document by invoice_no/year search, including finance, sales, delivery, and work-order links.",
    parameters: {
      type: "object",
      properties: {
        invoice_no: { type: "number" },
        year: { type: "number" },
        search: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "draft_supplier_escalation_message",
    description: "Draft a Hebrew escalation message for a supplier based on supplier name/context provided by the user.",
    parameters: {
      type: "object",
      properties: {
        supplier_name: { type: "string" },
        issue: { type: "string" },
      },
      additionalProperties: false,
    },
  },
];

export async function runAiTool(name: string, args: ToolArgs): Promise<AiToolResult> {
  const limit = Math.max(1, Math.min(Math.floor(numberArg(args, "limit", 20)), Number(process.env.AI_MAX_ROWS ?? 50)));

  switch (name) {
    case "get_procurement_analysis": {
      const search=stringArg(args,"search")??"";
      const feedback=procurementSearchFeedback(search);
      if(feedback)return {name,data:feedback,rowCount:0,sources:[],freshness:null};
      const data=await fetchProcurementAnalysis({from:stringArg(args,"from"),to:stringArg(args,"to"),search:stringArg(args,"search")});
      return {name,data:sanitizeToolText({...data,quarters:data.quarters.slice(0,60),suppliers:data.suppliers.slice(0,30),forecast:data.forecast.slice(0,60),quartersTruncated:data.quartersTruncated||data.quarters.length>60,suppliersTruncated:data.suppliers.length>30,forecastTruncated:data.forecastTruncated||data.forecast.length>60,toolOutputLimits:{quarters:60,suppliers:30,forecast:60},sourceTables:["HeshSapakRashi","HeshSapakNigrar"],coverageInterpretation:"Only supplier-invoice lines joined to unambiguous headers, excluding blank/underscore-code annotations with zero/missing quantity, price and amount. The exclusion count is in coverage.excludedNonFinancialLines; these records remain in the raw source. matchedInvoiceLines equals sourceRows plus excludedNonFinancialLines: it is the before-exclusion count, not a conflicting count or missing-data warning. Completeness against BINA is not established by this query. Contracts for purchase requests (BakashaNigrar) or goods receipts (Tovin) do not establish supplier-invoice coverage."}),rowCount:data.sourceRows,sources:["mart_procurement_invoice_lines"],freshness:data.freshness};
    }
    case "get_operations_workspace": {
      const db=createServiceSupabase();
      const search=(stringArg(args,"search")??"").trim().slice(0,150);
      const taskQuery=db.from("operations_tasks").select("title,owner_name,status,due_date,category,description,updated_at");
      // Literal substring matching is applied after a bounded retrieval; never interpolate model text into PostgREST filter syntax.
      const [tasks,capabilities,maintenance]=await Promise.all([taskQuery.order("updated_at",{ascending:false}).limit(500),db.from("supplier_capabilities").select("supplier_code,service_name,unit,unit_price,currency,valid_from,valid_until,notes").eq("is_active",true).limit(100),fetchMaintenanceStations()]);
      if(tasks.error||capabilities.error)throw Error("OPERATIONS_UNAVAILABLE");
      return {name,data:sanitizeToolText({tasks:(tasks.data??[]).filter(task=>!search||`${task.title} ${task.owner_name} ${task.description}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).slice(0,100).map(task=>({...task,status_label:({open:"פתוח",in_progress:"בטיפול",done:"הושלם",cancelled:"בוטל"} as Record<string,string>)[task.status]})),taskSearch:search,taskSourceTruncated:(tasks.data?.length??0)>=500,capabilities:capabilities.data,maintenance,limit:100,coverage:"current_application_records; tasks searched within latest 500 updated records, output limited to 100; capability list limited to 100; not guaranteed complete"}),rowCount:(tasks.data?.length??0)+(capabilities.data?.length??0)+maintenance.length,sources:["operations_tasks","supplier_capabilities","stations"],freshness:null};
    }
    case "get_bina_weekly_snapshot": {
      const snapshot = await fetchBinaWeekly(stringArg(args, "start"));
      return { name, data: sanitizeToolText({ ...snapshot, metricDefinitions: { stations: "distinctOrderCount counts distinct incoming work orders; rows counts route operations, NOT jobs or completed production", preparation: "Never recommend sent/shipped/completed/cancelled orders for preparation. Remaining candidates still need file, material and station checks." }, preparationCandidates: snapshot.orders.filter((order) => !/נשלח|נשלחה|בוטל|בוטלה|הושלם|הושלמה|סגור|סגורה|shipped|sent|complete|cancel/i.test(order.status)).slice(0, 100), orders: snapshot.orders.slice(0, 100), purchases: snapshot.purchases.slice(0, 100), detailTruncated: snapshot.orders.length > 100 || snapshot.purchases.length > 100 }), rowCount: snapshot.orderCount + snapshot.purchaseCount, sources: ["bina_dfhazmrashi", "bina_dfshelita", "mart_bina_purchase_flow"], freshness: snapshot.latestSync };
    }
    case "get_gestelit_manufacturing_overview": {
      const snapshot = buildOverview(await fetchActiveJobsWithProgress({ includeWaiting: true }), israelDate());
      const search = (stringArg(args, "search") ?? "").trim().toLocaleLowerCase();
      const matching = snapshot.rows.filter(row => `${row.job.job_number} ${row.job.customer_name ?? ""}`.toLocaleLowerCase().includes(search));
      const selected = matching.slice(0, limit);
      const fetchedAt = new Date().toISOString();
      const rows = selected.map(row => ({
        id: row.job.id, job_number: row.job.job_number, customer_name: row.job.customer_name,
        due_date: row.job.due_date, overdue: row.overdue, due_today: row.dueToday,
        needs_setup: row.needsSetup, active_sessions: row.activeSessionCount,
        planned: row.planned, terminal_good: row.good, terminal_scrap: row.scrap,
        completion_percent: row.percent,
        products: row.jobItems.map(item => ({ name: item.jobItem.name, planned: item.plannedQuantity,
          terminal_good: item.completedGood, terminal_scrap: item.completedScrap,
          stations: item.wipDistribution.map(step => ({ name: step.stationName, position: step.position,
            terminal: step.isTerminal, good_reported: step.goodReported, scrap_reported: step.scrapReported })) })),
      }));
      return {
        name, rowCount: rows.length, freshness: fetchedAt,
        sources: ["jobs", "job_items", "job_item_steps", "job_item_progress", "wip_balances", "sessions"],
        data: sanitizeToolText({ rows, totalMatching: matching.length, truncated: matching.length > rows.length,
          summary: { openJobs: snapshot.rows.length, overdue: snapshot.overdue, dueToday: snapshot.dueToday, needsSetup: snapshot.needsSetup, withoutSession: snapshot.waiting },
          observedAt: fetchedAt,
          scope: "Saved Gestelit jobs, not all BINA orders. Explicitly classified demo/test records are excluded. Unclassified local records remain and are not necessarily BINA-linked. Completion includes terminal scrap and is capped per product. Quantities span each job lifetime, not today. No active session does not mean a malfunction. Stoppage status, capacity and material availability are not established by this tool." }),
        citations: selected.map(row => ({ source_view: "jobs + job_item_progress", grain: "job", key: row.job.id,
          label: `עבודה ${row.job.job_number}`, synced_at: fetchedAt, confidence: "exact" as const,
          fields_used: ["job_number", "due_date", "planned_quantity", "completed_good", "completed_scrap"] })),
      };
    }
    case "query_analytics": return runAnalyticsQuery(args);
    case "get_bina_dashboard_summary": {
      const summary = await fetchBinaDashboardSummary();
      return {
        name,
        data: sanitizeToolText(summary),
        rowCount: (summary.risks?.length ?? 0) + (summary.dataQuality?.length ?? 0) + 1,
        sources: [
          "rpc_bina_dashboard_summary",
          "mart_bina_cross_domain_risk",
          "mart_bina_sync_coverage",
          "mart_bina_data_quality",
          "mart_bina_finance_summary_by_currency_confidence",
        ],
        citations: [
          ...citationsFromRows("mart_bina_cross_domain_risk", summary.risks ?? []),
          ...citationsFromRows("mart_bina_data_quality", summary.dataQuality ?? []),
        ],
        freshness: typeof summary.coverage?.last_synced_at === "string" ? summary.coverage.last_synced_at : null,
      };
    }
    case "get_operational_overview": {
      const overview = await fetchBinaOverview();
      return {
        name,
        data: sanitizeToolText(overview),
        rowCount: 1,
        sources: [
          "mart_bina_sync_health",
          "mart_bina_work_order_status",
          "mart_bina_purchase_flow",
          "mart_bina_supplier_aging",
          "mart_bina_sales_status",
          "mart_bina_delivery_status",
        ],
        citations: [{
          source_view: "mart_bina_overview_kpis",
          grain: "dashboard",
          key: "overview",
          label: "סיכום תפעולי BINA",
          synced_at: overview.sync.lastSyncedAt,
          confidence: "inferred",
          fields_used: ["sync", "workOrders", "purchasing", "suppliers", "sales", "deliveries"],
        }],
        freshness: overview.sync.lastSyncedAt,
      };
    }
    case "get_cross_domain_risk_map": {
      const search = stringArg(args, "search");
      const unavailableSources: string[] = [];
      const optional = <T>(source: string, query: Promise<T>, fallback: T) => query.catch(() => {
        unavailableSources.push(source);
        return fallback;
      });
      const [overview, sync, riskQueue, workOrders, purchasing, suppliers, finance, sales, deliveries] = await Promise.all([
        optional("mart_bina_overview_kpis", fetchBinaOverview(), null),
        optional("mart_bina_sync_health", fetchBinaSyncStatus(), { tables: [], logs: [] }),
        optional("mart_bina_cross_domain_risk", fetchBinaCrossDomainRisks({ search, limit }), []),
        optional("mart_bina_work_order_status", fetchBinaWorkOrders({ search, limit: 200 }), { rows: [], count: 0 }),
        optional("mart_bina_purchase_flow", fetchBinaPurchasing({ search, limit: 200 }), { rows: [], count: 0 }),
        optional("mart_bina_supplier_aging", fetchBinaSuppliers({ search, limit: 100 }), { rows: [], count: 0 }),
        optional("mart_bina_finance", fetchBinaFinance({ search, limit: 100 }), { rows: [], count: 0 }),
        optional("mart_bina_sales_status", fetchBinaSales({ search, limit: 100 }), { rows: [], count: 0 }),
        optional("mart_bina_delivery_status", fetchBinaDeliveries({ search, limit: 100 }), { rows: [], count: 0 }),
      ]);
      const riskyWorkOrders = workOrders.rows
        .filter((row) => row.link_status !== "linked")
        .slice(0, limit);
      const openPurchase = purchasing.rows
        .filter((row) => row.flow_type === "purchase_request" || (row.remaining_quantity ?? 0) > 0)
        .slice(0, limit);
      const overdueSuppliers = suppliers.rows
        .filter((row) => (row.overdue_balance ?? 0) > 0 || (row.open_balance ?? 0) > 0)
        .slice(0, limit);
      const openFinance = finance.rows
        .filter((row) => (row.open_amount ?? 0) > 0 || row.kind === "supplier_invoice")
        .slice(0, limit);
      const openDeliveries = deliveries.rows
        .filter((row) => row.delivery_state === "sent_open")
        .slice(0, limit);
      const workOrderIds = new Set(riskyWorkOrders.map((row) => row.work_order_id).filter(Boolean));
      const linkedPurchasing = openPurchase.filter((row) => row.work_order_id && workOrderIds.has(row.work_order_id));
      const linkedSales = sales.rows.filter((row) => row.work_order_id && workOrderIds.has(row.work_order_id)).slice(0, limit);
      const linkedDeliveries = openDeliveries.filter((row) => row.work_order_id && workOrderIds.has(row.work_order_id)).slice(0, limit);

      return {
        name,
        data: sanitizeToolText({
          overview,
          coverage: "partial_sample",
          unavailableSources,
          evidenceNote: unavailableSources.length ? "Listed sources are unavailable; missing rows do not establish absence of risks. Other domains are sampled." : "Domains are sampled; links require matching keys.",
          syncFreshness: sync.tables.slice(0, 25),
          evidenceBackedRiskQueue: riskQueue,
          riskyWorkOrders,
          openPurchase,
          overdueSuppliers,
          openFinance,
          openDeliveries,
          linkedRiskSignals: {
            purchasingTouchingRiskyOrders: linkedPurchasing,
            salesTouchingRiskyOrders: linkedSales,
            deliveriesTouchingRiskyOrders: linkedDeliveries,
          },
        }),
        rowCount: riskQueue.length + riskyWorkOrders.length + openPurchase.length + overdueSuppliers.length + openFinance.length + openDeliveries.length,
        sources: [
          "mart_bina_overview_kpis",
          "mart_bina_sync_health",
          "mart_bina_work_order_status",
          "mart_bina_purchase_flow",
          "mart_bina_supplier_aging",
          "mart_bina_finance",
          "mart_bina_sales_status",
          "mart_bina_delivery_status",
        ].filter((source) => !unavailableSources.includes(source)),
        citations: [
          ...citationsFromRows("mart_bina_cross_domain_risk", riskQueue),
          ...citationsFromRows("mart_bina_work_order_status", riskyWorkOrders),
          ...citationsFromRows("mart_bina_finance_transactions", openFinance),
        ],
        freshness: overview?.sync.lastSyncedAt ?? null,
      };
    }
    case "get_bina_sync_health": {
      const status = await fetchBinaSyncStatus();
      return {
        name,
        data: sanitizeToolText(status),
        rowCount: status.tables.length,
        sources: ["mart_bina_metric_trust", "bina_sync_runs", "bina_sync_table_runs", "bina_sync_log"],
        freshness: status.tables.reduce<string | null>((latest, table) => {
          if (!table.last_row_synced_at) return latest;
          return !latest || table.last_row_synced_at > latest ? table.last_row_synced_at : latest;
        }, null),
      };
    }
    case "get_metric_trust": {
      const domain = stringArg(args, "domain");
      const status = await fetchBinaSyncStatus();
      const trust = selectMetricTrust(status.coverage ?? [], domain);
      const { rows } = trust;
      return {
        name,
        data: sanitizeToolText({
          domain: trust.domain,
          coverageStatus: trust.coverageStatus,
          rows,
        }),
        rowCount: rows.length,
        sources: ["mart_bina_metric_trust", "bina_source_contracts", "bina_sync_table_runs"],
        citations: rows.slice(0, 20).map((row) => ({
          source_view: "mart_bina_metric_trust",
          grain: String(row.grain ?? "source_table"),
          key: row.source_table,
          label: `${row.source_table} · ${row.coverage_status}`,
          synced_at: row.last_row_synced_at,
          confidence: row.coverage_status === "complete" ? "exact" : "inferred",
          fields_used: ["source_table", "domain", "coverage_status", "freshness_status", "sync_scope", "trust_note"],
        })),
        freshness: rows.reduce<string | null>((latest, table) => {
          if (!table.last_row_synced_at) return latest;
          return !latest || table.last_row_synced_at > latest ? table.last_row_synced_at : latest;
        }, null),
      };
    }
    case "get_available_metrics": {
      const metrics = await fetchAvailableMetrics();
      return rowsResult(name, metrics, ["semantic_bina_metrics"]);
    }
    case "get_recent_bina_changes": {
      const [sync, workOrders, purchasing, sales, deliveries] = await Promise.all([
        fetchBinaSyncStatus(),
        fetchBinaWorkOrders({ limit }),
        fetchBinaPurchasing({ limit }),
        fetchBinaSales({ limit }),
        fetchBinaDeliveries({ limit }),
      ]);
      const data = {
        latestSync: sync.logs.slice(0, 5),
        recentWorkOrders: workOrders.rows.slice(0, limit),
        recentPurchasing: purchasing.rows.slice(0, limit),
        recentSales: sales.rows.slice(0, limit),
        recentDeliveries: deliveries.rows.slice(0, limit),
      };
      return {
        name,
        data: sanitizeToolText(data),
        rowCount: Object.values(data).reduce((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0),
        sources: ["bina_sync_log", "mart_bina_work_order_status", "mart_bina_purchase_flow", "mart_bina_sales_status", "mart_bina_delivery_status"],
        freshness: sync.tables.reduce<string | null>((latest, table) => {
          if (!table.last_row_synced_at) return latest;
          return !latest || table.last_row_synced_at > latest ? table.last_row_synced_at : latest;
        }, null),
      };
    }
    case "explain_data_coverage": {
      const data = {
        mapped: [
          "פק״עות והזמנות",
          "שורות ייצור",
          "רכש ובקשות רכש",
          "ספקים ויתרות",
          "חשבוניות ספק",
          "חשבוניות לקוח",
          "משלוחים",
          "בריאות סנכרון",
        ],
        partial: [
          "חומרי מלאי - DFMlay קיים, TnuotMlay מושהה עד תיקון מפתח",
          "ספקי חוץ - מזוהה דרך משלוחים/טובין/ספקים, אבל קשרים מלאים לפק״ע דורשים אימות נוסף",
          "עובדים מ-BINA - SqlLogins קיים אך לא חשוף ל-AI כברירת מחדל",
        ],
        missing: [
          "DFShelitaOved לעובדי ייצור מפורטים",
          "מילון סטטוסים מלא של BINA",
          "join ודאי לכל טבלאות נגרר מול ראשי בחשבוניות/טובין/משלוחים",
        ],
      };
      return {
        name,
        data,
        rowCount: data.mapped.length + data.partial.length + data.missing.length,
        sources: ["semantic-catalog", "stg_*", "mart_*"],
      };
    }
    case "get_new_bina_job_candidates": {
      const { rows } = await fetchBinaWorkOrders({ limit, dateFrom: BINA_OPERATIONAL_START, incomingOnly: true });
      return rowsResult(name, rows, ["mart_bina_incoming_work_orders"]);
    }
    case "get_late_or_risky_work_orders": {
      const { rows } = await fetchBinaWorkOrders({ limit: 200, dateFrom: BINA_OPERATIONAL_START });
      const risky = rows.filter((row) => row.gestelit_job_id && ["at_risk", "quantity_mismatch"].includes(row.link_status)).slice(0, limit);
      return rowsResult(name, risky, ["mart_bina_work_order_status", "mart_gestelit_bina_reconciliation"]);
    }
    case "compare_bina_order_to_gestelit_job": {
      const { rows } = await fetchBinaWorkOrders({ search: stringArg(args, "search"), limit: 200 });
      const mismatches = rows
        .filter((row) => row.link_status !== "linked" || (row.bina_quantity ?? 0) !== (row.gestelit_planned_quantity ?? row.bina_quantity ?? 0))
        .slice(0, limit);
      return rowsResult(name, mismatches, ["mart_gestelit_bina_reconciliation"]);
    }
    case "get_floor_progress_for_bina_order": {
      const detail = await fetchBinaWorkOrderDetail(String(args.bina_id));
      return {
        name,
        data: sanitizeToolText(detail),
        rowCount: detail.productionRows.length + (detail.order ? 1 : 0),
        sources: ["mart_bina_work_order_status", "stg_bina_production_rows", "job_items", "job_item_progress"],
        freshness: detail.order?.synced_at ?? null,
      };
    }
    case "search_bina_work_orders": {
      const { rows } = await fetchBinaWorkOrders({ search: stringArg(args, "search"), limit });
      return rowsResult(name, rows, ["mart_bina_work_order_status"]);
    }
    case "get_bina_work_order": {
      const detail = await fetchBinaWorkOrderDetail(String(args.bina_id));
      return {
        name,
        data: sanitizeToolText(detail),
        rowCount: detail.productionRows.length + (detail.order ? 1 : 0),
        sources: ["mart_bina_work_order_status", "stg_bina_production_rows"],
        citations: [...citationsFromRows("mart_bina_work_order_status", detail.order ? [detail.order] : []), ...citationsFromRows("stg_bina_production_rows", detail.productionRows)],
        freshness: detail.order?.synced_at ?? null,
      };
    }
    case "get_purchase_kpis": {
      const overview = await fetchBinaOverview();
      return {
        name,
        data: sanitizeToolText({
          purchasing: { openRequestLines: overview.purchasing.openRequestLines, sampledAmount: { value: overview.purchasing.openRequestAmount, currency: null, scope: "sample_only", usableAsCompanyTotal: false } },
          suppliers: overview.suppliers, sync: overview.sync, scope: overview.scope,
        }),
        rowCount: 1,
        sources: ["mart_bina_purchase_flow", "mart_bina_supplier_aging", "mart_bina_sync_health"],
        freshness: overview.sync.lastSyncedAt,
      };
    }
    case "get_material_blockers": {
      const [material, purchasing, risky] = await Promise.all([
        fetchBinaMaterialReadiness({ search: stringArg(args, "search"), limit: 200 }),
        fetchBinaPurchasing({ search: stringArg(args, "search"), limit: 200 }),
        fetchBinaWorkOrders({ limit: 200 }),
      ]);
      const materialReadiness = material.rows
        .filter((row) => row.material_state === "short_or_unknown" || row.material_state === "purchase_requested")
        .slice(0, limit);
      const openPurchasing = purchasing.rows
        .filter((row) => (row.remaining_quantity ?? 0) > 0 || row.flow_type === "purchase_request")
        .slice(0, limit);
      const riskyOrders = risky.rows.filter((row) => row.link_status === "at_risk").slice(0, limit);
      return {
        name,
        data: sanitizeToolText({ materialReadiness, openPurchasing, riskyOrders }),
        rowCount: materialReadiness.length + openPurchasing.length + riskyOrders.length,
        sources: ["mart_bina_material_readiness", "mart_bina_purchase_flow", "mart_bina_work_order_status"],
        citations: [
          ...citationsFromRows("mart_bina_material_readiness", materialReadiness),
          ...citationsFromRows("mart_bina_purchase_flow", openPurchasing),
          ...citationsFromRows("mart_bina_work_order_status", riskyOrders),
        ],
        freshness: materialReadiness[0]?.synced_at ?? openPurchasing[0]?.synced_at ?? riskyOrders[0]?.synced_at ?? null,
      };
    }
    case "get_material_readiness": {
      const workOrderId = numberArg(args, "work_order_id", -1);
      const materialState = stringArg(args, "material_state");
      const { rows } = await fetchBinaMaterialReadiness({
        workOrderId: workOrderId > -1 ? workOrderId : undefined,
        materialState,
        search: stringArg(args, "search"),
        limit,
      });
      return rowsResult(name, rows, ["mart_bina_material_readiness"], rows[0]?.synced_at ?? null);
    }
    case "get_work_order_operational_profile": {
      const workOrderId = numberArg(args, "work_order_id", -1);
      const profile = await fetchBinaWorkOrderOperationalProfile({
        binaId: stringArg(args, "bina_id"),
        workOrderId: workOrderId > -1 ? workOrderId : undefined,
        search: stringArg(args, "search"),
        limit,
      });
      const citations = [
        ...citationsFromRows("mart_bina_work_order_status", profile.workOrder ? [profile.workOrder] : []),
        ...citationsFromRows("mart_bina_material_readiness", profile.material ? [profile.material] : []),
        ...citationsFromRows("mart_bina_route_suggestions", profile.route ? [profile.route] : []),
        ...citationsFromRows("stg_bina_production_rows", profile.productionRows),
        ...citationsFromRows("mart_bina_purchase_flow", profile.relatedPurchasing),
        ...citationsFromRows("mart_bina_delivery_status", profile.relatedDeliveries),
        ...citationsFromRows("mart_bina_finance_transactions", profile.relatedFinance),
        ...citationsFromRows("mart_bina_sales_status", profile.relatedSales),
      ];
      return {
        name,
        data: sanitizeToolText({ ...profile, quantityDefinitions: {
          finishedProduct: "workOrder.bina_quantity is the BINA header finished-product order quantity; import preserves it.",
          operation: "productionRows.planned_quantity belongs to an operation/material unit (e.g. sheets), not an alternative finished-product quantity. Do not compare quantities across units or sum them as finished products.",
          material: "material.required_quantity is inferred from operation rows and does not prove allocated stock or readiness.",
        } }),
        rowCount: citations.length,
        sources: [
          "mart_bina_work_order_status",
          "mart_bina_material_readiness",
          "mart_bina_route_suggestions",
          "stg_bina_production_rows",
          "mart_bina_purchase_flow",
          "mart_bina_delivery_status",
          "mart_bina_finance_transactions",
          "mart_bina_sales_status",
        ],
        citations,
        freshness: profile.material?.synced_at ?? profile.route?.synced_at ?? profile.workOrder?.synced_at ?? null,
      };
    }
    case "get_purchase_flow_for_work_order": {
      const workOrderId = numberArg(args, "work_order_id", -1);
      const [orders, purchasing, deliveries] = await Promise.all([
        fetchBinaWorkOrders({ search: String(workOrderId), limit }),
        fetchBinaPurchasing({ search: String(workOrderId), limit }),
        fetchBinaDeliveries({ search: String(workOrderId), limit }),
      ]);
      const matchedOrders = orders.rows.filter((row) => row.work_order_id === workOrderId);
      const matchedPurchasing = purchasing.rows.filter((row) => row.work_order_id === workOrderId);
      const matchedDeliveries = deliveries.rows.filter((row) => row.work_order_id === workOrderId);
      return {
        name,
        data: sanitizeToolText({ orders: matchedOrders, purchasing: matchedPurchasing, deliveries: matchedDeliveries, coverage: "partial_sample" }),
        rowCount: matchedOrders.length + matchedPurchasing.length + matchedDeliveries.length,
        sources: ["mart_bina_work_order_status", "mart_bina_purchase_flow", "mart_bina_delivery_status"],
        citations: [...citationsFromRows("mart_bina_work_order_status", matchedOrders), ...citationsFromRows("mart_bina_purchase_flow", matchedPurchasing), ...citationsFromRows("mart_bina_delivery_status", matchedDeliveries)],
        freshness: matchedOrders[0]?.synced_at ?? matchedPurchasing[0]?.synced_at ?? null,
      };
    }
    case "get_open_purchase_requests": {
      const { rows, count } = await fetchBinaPurchasing({ search: stringArg(args, "search"), limit, openRequestsOnly: true });
      const result = rowsResult(name, rows, ["mart_bina_purchase_flow"]);
      return { ...result, data: sanitizeToolText({ rows, totalMatchingCachedRows: count, coverage: "partial_sample" }) };
    }
    case "search_purchase_lines": {
      const { rows } = await fetchBinaPurchasing({ search: stringArg(args, "search"), limit });
      return rowsResult(name, rows, ["mart_bina_purchase_flow"]);
    }
    case "get_supplier_aging": {
      const sortBy = args.sort_by === "open_balance" ? "open_balance" : "overdue_balance";
      const { rows } = await fetchBinaSuppliers({ search: stringArg(args, "search"), limit, sortBy });
      return rowsResult(name, rows, ["mart_bina_supplier_aging"]);
    }
    case "get_supplier_summary": {
      const [suppliers, purchasing, finance] = await Promise.all([
        fetchBinaSuppliers({ search: stringArg(args, "search"), limit }),
        fetchBinaPurchasing({ search: stringArg(args, "search"), limit }),
        fetchBinaFinance({ search: stringArg(args, "search"), limit }),
      ]);
      return {
        name,
        data: sanitizeToolText({ suppliers: suppliers.rows, purchasing: purchasing.rows, finance: finance.rows }),
        rowCount: suppliers.rows.length + purchasing.rows.length + finance.rows.length,
        sources: ["mart_bina_supplier_aging", "mart_bina_purchase_flow", "mart_bina_finance"],
      };
    }
    case "get_supplier_late_deliveries": {
      const [suppliers, deliveries] = await Promise.all([
        fetchBinaSuppliers({ search: stringArg(args, "search"), limit }),
        fetchBinaDeliveries({ search: stringArg(args, "search"), limit: 200 }),
      ]);
      return {
        name,
        data: sanitizeToolText({
          suppliersWithOverdueBalance: suppliers.rows.filter((row) => (row.overdue_balance ?? 0) > 0),
          openDeliveries: deliveries.rows.filter((row) => row.delivery_state === "sent_open").slice(0, limit),
        }),
        rowCount: suppliers.rows.length + deliveries.rows.length,
        sources: ["mart_bina_supplier_aging", "mart_bina_delivery_status"],
      };
    }
    case "get_customer_summary": {
      const [orders, sales, deliveries] = await Promise.all([
        fetchBinaWorkOrders({ search: stringArg(args, "search"), limit }),
        fetchBinaSales({ search: stringArg(args, "search"), limit }),
        fetchBinaDeliveries({ search: stringArg(args, "search"), limit }),
      ]);
      return {
        name,
        data: sanitizeToolText({ orders: orders.rows, sales: sales.rows, deliveries: deliveries.rows }),
        rowCount: orders.rows.length + sales.rows.length + deliveries.rows.length,
        sources: ["mart_bina_work_order_status", "mart_bina_sales_status", "mart_bina_delivery_status"],
      };
    }
    case "get_supplier_invoice_summary": {
      const { rows } = await fetchBinaFinance({ search: stringArg(args, "search"), limit });
      return rowsResult(
        name,
        rows.filter((row) => row.kind === "supplier_invoice" || row.kind === "debt"),
        ["mart_bina_finance"],
      );
    }
    case "get_open_debts": {
      const { rows } = await fetchBinaFinance({ search: stringArg(args, "search"), limit, openOnly: true });
      return rowsResult(name, rows, ["mart_bina_finance_transactions"]);
    }
    case "get_delivery_status": {
      const deliveryState = stringArg(args, "delivery_state");
      const { rows, count } = await fetchBinaDeliveries({ search: stringArg(args, "search"), limit, deliveryState });
      const result = rowsResult(name, rows, ["mart_bina_delivery_status"]);
      return { ...result, data: sanitizeToolText({ rows, totalMatchingCachedRows: count, coverage: "partial_sample", requestedState: deliveryState ?? null, interpretation: "Only sent_open is evidence of a dispatched open delivery. draft_or_unknown is not evidence of dispatch. Empty cache results do not prove none exist in BINA." }) };
    }
    case "get_sales_invoice_summary": {
      const { rows } = await fetchBinaSales({ search: stringArg(args, "search"), limit });
      return rowsResult(name, rows, ["mart_bina_sales_status"]);
    }
    case "get_sales_activity_log": {
      const { rows } = await fetchSalesActivities({
        search: stringArg(args, "search"),
        status: stringArg(args, "status"),
        limit,
      });
      return rowsResult(name, rows, ["sales_activity_logs"]);
    }
    case "get_sales_followups_due": {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const { rows } = await fetchSalesActivities({
        status: "follow_up",
        nextActionTo: today,
        limit,
      });
      const result = rowsResult(name, rows, ["sales_activity_logs"]);
      return { ...result, data: sanitizeToolText({ asOfDate: today, timeZone: "Asia/Jerusalem", scope: "follow_up status with next_action_date on or before asOfDate; limited rows, not a full task count", rows: rows.map((row) => ({ ...row, dueState: String(row.next_action_date).slice(0, 10) < today ? "overdue" : "due_today" })) }) };
    }
    case "get_sales_client_activity": {
      const [summary, clients] = await Promise.all([
        fetchSalesSummary(),
        fetchSalesClients({ search: stringArg(args, "search"), limit }),
      ]);
      return {
        name,
        data: sanitizeToolText({ summary, clients: clients.rows }),
        rowCount: clients.rows.length,
        sources: ["sales_activity_logs", "mart_sales_client_activity", "mart_bina_sales_status"],
        citations: citationsFromRows("mart_sales_client_activity", clients.rows),
      };
    }
    case "get_order_risk_evidence": {
      const workOrderId = numberArg(args, "work_order_id", -1);
      const [orders, purchasing, finance, sales, deliveries] = await Promise.all([
        fetchBinaWorkOrders({ search: String(workOrderId), limit }),
        fetchBinaPurchasing({ search: String(workOrderId), limit }),
        fetchBinaFinance({ search: String(workOrderId), limit }),
        fetchBinaSales({ search: String(workOrderId), limit }),
        fetchBinaDeliveries({ search: String(workOrderId), limit }),
      ]);
      // Search can match a title/document number belonging to another order.
      // Only explicit relationship keys establish evidence for the requested order.
      orders.rows = orders.rows.filter((row) => row.work_order_id === workOrderId);
      purchasing.rows = purchasing.rows.filter((row) => row.work_order_id === workOrderId);
      finance.rows = finance.rows.filter((row) => row.related_work_order_id === workOrderId);
      sales.rows = sales.rows.filter((row) => row.work_order_id === workOrderId);
      deliveries.rows = deliveries.rows.filter((row) => row.work_order_id === workOrderId);
      const detail = orders.rows[0]?.bina_id ? await fetchBinaWorkOrderDetail(String(orders.rows[0].bina_id)) : null;
      const citations = [
        ...citationsFromRows("mart_bina_work_order_status", orders.rows),
        ...citationsFromRows("stg_bina_production_rows", detail?.productionRows ?? []),
        ...citationsFromRows("mart_bina_purchase_flow", purchasing.rows.filter((row) => row.work_order_id === workOrderId)),
        ...citationsFromRows("mart_bina_finance_transactions", finance.rows.filter((row) => row.related_work_order_id === workOrderId)),
        ...citationsFromRows("mart_bina_sales_status", sales.rows.filter((row) => row.work_order_id === workOrderId)),
        ...citationsFromRows("mart_bina_delivery_status", deliveries.rows.filter((row) => row.work_order_id === workOrderId)),
      ];
      return {
        name,
        data: sanitizeToolText({
          workOrderId,
          order: detail?.order ?? orders.rows[0] ?? null,
          productionRows: detail?.productionRows ?? [],
          purchasing: purchasing.rows,
          finance: finance.rows,
          sales: sales.rows,
          deliveries: deliveries.rows,
          linkConfidence: {
            workOrder: orders.rows.length > 0 ? "exact" : "missing_data",
            purchasing: purchasing.rows.some((row) => row.work_order_id === workOrderId) ? "exact" : "missing_data",
            finance: finance.rows.some((row) => row.related_work_order_id === workOrderId) ? "exact" : "missing_data",
            sales: sales.rows.some((row) => row.work_order_id === workOrderId) ? "exact" : "missing_data",
            deliveries: deliveries.rows.some((row) => row.work_order_id === workOrderId) ? "exact" : "missing_data",
          },
        }),
        rowCount: citations.length,
        sources: ["mart_bina_work_order_status", "stg_bina_production_rows", "mart_bina_purchase_flow", "mart_bina_finance_transactions", "mart_bina_sales_status", "mart_bina_delivery_status"],
        citations,
        freshness: detail?.order?.synced_at ?? orders.rows[0]?.synced_at ?? null,
      };
    }
    case "get_supplier_evidence": {
      const supplierCode = numberArg(args, "supplier_code", -1);
      const search = supplierCode > -1 ? undefined : stringArg(args, "search");
      const exactCode = supplierCode > -1 ? supplierCode : undefined;
      const [suppliers, purchasing, finance] = await Promise.all([
        fetchBinaSuppliers({ search, supplierCode: exactCode, limit }),
        fetchBinaPurchasing({ search, supplierCode: exactCode, limit }),
        fetchBinaFinance({ search, partyCode: exactCode, partyType: "supplier", limit }),
      ]);
      const supplierRows = supplierCode > -1 ? suppliers.rows.filter((row) => row.supplier_code === supplierCode) : suppliers.rows;
      const purchasingRows = supplierCode > -1 ? purchasing.rows.filter((row) => row.supplier_code === supplierCode) : purchasing.rows;
      const financeRows = supplierCode > -1 ? finance.rows.filter((row) => row.party_code === supplierCode) : finance.rows;
      const citations = [
        ...citationsFromRows("mart_bina_supplier_aging", supplierRows),
        ...citationsFromRows("mart_bina_purchase_flow", purchasingRows),
        ...citationsFromRows("mart_bina_finance_transactions", financeRows),
      ];
      return {
        name,
        data: sanitizeToolText({
          supplierCode: supplierCode > -1 ? supplierCode : null,
          supplierRows,
          purchasingRows,
          financeRows,
          linkConfidence: {
            supplier: supplierRows.length > 0 ? "exact" : "missing_data",
            purchasing: purchasingRows.some((row) => row.supplier_code === supplierCode) ? "exact" : "inferred",
            finance: financeRows.some((row) => row.party_code === supplierCode) ? "exact" : "inferred",
          },
        }),
        rowCount: citations.length,
        sources: ["mart_bina_supplier_aging", "mart_bina_purchase_flow", "mart_bina_finance_transactions"],
        citations,
        freshness: supplierRows[0]?.synced_at ?? purchasingRows[0]?.synced_at ?? financeRows[0]?.synced_at ?? null,
      };
    }
    case "get_invoice_evidence": {
      const invoiceNo = numberArg(args, "invoice_no", -1);
      const search = stringArg(args, "search") ?? (invoiceNo > -1 ? String(invoiceNo) : undefined);
      const [finance, sales, deliveries, orders] = await Promise.all([
        fetchBinaFinance({ search, limit }),
        fetchBinaSales({ search, limit }),
        fetchBinaDeliveries({ search, limit }),
        fetchBinaWorkOrders({ search, limit }),
      ]);
      const financeRows = invoiceNo > -1 ? finance.rows.filter((row) => String(row.document_no) === String(invoiceNo)) : finance.rows;
      const salesRows = invoiceNo > -1 ? sales.rows.filter((row) => row.invoice_no === invoiceNo) : sales.rows;
      const workOrderIds = new Set([...financeRows.map((row) => row.related_work_order_id), ...salesRows.map((row) => row.work_order_id)].filter(Boolean));
      const deliveryNos = new Set([...financeRows.map((row) => row.related_delivery_no), ...salesRows.map((row) => row.delivery_no)].filter(Boolean));
      const deliveryRows = deliveries.rows.filter((row) => deliveryNos.size === 0 || deliveryNos.has(row.delivery_no));
      const orderRows = orders.rows.filter((row) => workOrderIds.size === 0 || workOrderIds.has(row.work_order_id));
      const citations = [
        ...citationsFromRows("mart_bina_finance_transactions", financeRows),
        ...citationsFromRows("mart_bina_sales_status", salesRows),
        ...citationsFromRows("mart_bina_delivery_status", deliveryRows),
        ...citationsFromRows("mart_bina_work_order_status", orderRows),
      ];
      return {
        name,
        data: sanitizeToolText({
          invoiceNo: invoiceNo > -1 ? invoiceNo : null,
          financeRows,
          salesRows,
          deliveryRows,
          orderRows,
          linkConfidence: {
            finance: financeRows.length > 0 ? "exact" : "missing_data",
            sales: salesRows.length > 0 ? "exact" : "missing_data",
            deliveries: deliveryRows.length > 0 && deliveryNos.size > 0 ? "exact" : "inferred",
            workOrders: orderRows.length > 0 && workOrderIds.size > 0 ? "exact" : "inferred",
          },
        }),
        rowCount: citations.length,
        sources: ["mart_bina_finance_transactions", "mart_bina_sales_status", "mart_bina_delivery_status", "mart_bina_work_order_status"],
        citations,
        freshness: financeRows[0]?.synced_at ?? salesRows[0]?.synced_at ?? null,
      };
    }
    case "draft_supplier_escalation_message": {
      const supplierName = stringArg(args, "supplier_name") ?? "הספק";
      const issue = stringArg(args, "issue") ?? "עיכוב באספקה";
      const draft = `שלום ${supplierName},\n\nאנחנו מזהים ${issue} שמשפיע על תכנון הייצור. נשמח לקבל עדכון מיידי לגבי סטטוס, תאריך אספקה צפוי, והאם יש דרך להקדים את הטיפול.\n\nתודה.`;
      return {
        name,
        data: { draft },
        rowCount: 1,
        sources: ["assistant_draft"],
      };
    }
    default:
      throw new Error(`UNKNOWN_AI_TOOL: ${name}`);
  }
}
