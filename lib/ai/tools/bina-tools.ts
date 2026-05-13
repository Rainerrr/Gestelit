import {
  fetchBinaDeliveries,
  fetchBinaFinance,
  fetchBinaOverview,
  fetchBinaPurchasing,
  fetchBinaSales,
  fetchBinaSuppliers,
  fetchBinaSyncStatus,
  fetchBinaWorkOrderDetail,
  fetchBinaWorkOrders,
} from "@/lib/data/bina";
import { fetchAvailableMetrics } from "@/lib/ai/semantic-catalog";
import { sanitizeToolText } from "@/lib/ai/safety";

export type AiToolResult = {
  name: string;
  data: unknown;
  rowCount: number;
  sources: string[];
  freshness?: string | null;
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

function rowsResult(name: string, rows: unknown[], sources: string[], freshness?: string | null): AiToolResult {
  return {
    name,
    data: sanitizeToolText(rows),
    rowCount: rows.length,
    sources,
    freshness,
  };
}

export const aiToolDefinitions = [
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
    name: "get_late_or_risky_work_orders",
    description: "Get BINA work orders that are late, risky, quantity mismatched, or not imported into Gestelit.",
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
    description: "Search BINA work orders by customer, title, or order reference.",
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
    description: "Get suppliers with open and overdue balances.",
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
    description: "Get shipment/delivery rows, including sent-open deliveries.",
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
  const limit = Math.min(numberArg(args, "limit", 20), Number(process.env.AI_MAX_ROWS ?? 50));

  switch (name) {
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
        freshness: overview.sync.lastSyncedAt,
      };
    }
    case "get_cross_domain_risk_map": {
      const search = stringArg(args, "search");
      const [overview, sync, workOrders, purchasing, suppliers, finance, sales, deliveries] = await Promise.all([
        fetchBinaOverview(),
        fetchBinaSyncStatus(),
        fetchBinaWorkOrders({ search, limit: 200 }),
        fetchBinaPurchasing({ search, limit: 200 }),
        fetchBinaSuppliers({ search, limit: 100 }),
        fetchBinaFinance({ search, limit: 100 }),
        fetchBinaSales({ search, limit: 100 }),
        fetchBinaDeliveries({ search, limit: 100 }),
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
        .filter((row) => (row.balance ?? 0) > 0 || row.kind === "supplier_invoice")
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
          syncFreshness: sync.tables.slice(0, 25),
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
        rowCount: riskyWorkOrders.length + openPurchase.length + overdueSuppliers.length + openFinance.length + openDeliveries.length,
        sources: [
          "mart_bina_overview_kpis",
          "mart_bina_sync_health",
          "mart_bina_work_order_status",
          "mart_bina_purchase_flow",
          "mart_bina_supplier_aging",
          "mart_bina_finance",
          "mart_bina_sales_status",
          "mart_bina_delivery_status",
        ],
        freshness: overview.sync.lastSyncedAt,
      };
    }
    case "get_bina_sync_health": {
      const status = await fetchBinaSyncStatus();
      return {
        name,
        data: sanitizeToolText(status),
        rowCount: status.tables.length,
        sources: ["mart_bina_sync_health", "bina_sync_log"],
        freshness: status.tables.reduce<string | null>((latest, table) => {
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
    case "get_late_or_risky_work_orders": {
      const { rows } = await fetchBinaWorkOrders({ limit: 200 });
      const risky = rows.filter((row) => row.link_status !== "linked").slice(0, limit);
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
        freshness: detail.order?.synced_at ?? null,
      };
    }
    case "get_purchase_kpis": {
      const overview = await fetchBinaOverview();
      return {
        name,
        data: sanitizeToolText({ purchasing: overview.purchasing, suppliers: overview.suppliers, sync: overview.sync }),
        rowCount: 1,
        sources: ["mart_bina_purchase_flow", "mart_bina_supplier_aging", "mart_bina_sync_health"],
        freshness: overview.sync.lastSyncedAt,
      };
    }
    case "get_material_blockers": {
      const [purchasing, risky] = await Promise.all([
        fetchBinaPurchasing({ search: stringArg(args, "search"), limit: 200 }),
        fetchBinaWorkOrders({ limit: 200 }),
      ]);
      const openPurchasing = purchasing.rows
        .filter((row) => (row.remaining_quantity ?? 0) > 0 || row.flow_type === "purchase_request")
        .slice(0, limit);
      const riskyOrders = risky.rows.filter((row) => row.link_status === "at_risk").slice(0, limit);
      return {
        name,
        data: sanitizeToolText({ openPurchasing, riskyOrders }),
        rowCount: openPurchasing.length + riskyOrders.length,
        sources: ["mart_bina_purchase_flow", "mart_bina_work_order_status"],
      };
    }
    case "get_purchase_flow_for_work_order": {
      const workOrderId = numberArg(args, "work_order_id", -1);
      const [orders, purchasing, deliveries] = await Promise.all([
        fetchBinaWorkOrders({ search: String(workOrderId), limit }),
        fetchBinaPurchasing({ search: String(workOrderId), limit }),
        fetchBinaDeliveries({ search: String(workOrderId), limit }),
      ]);
      return {
        name,
        data: sanitizeToolText({ orders: orders.rows, purchasing: purchasing.rows, deliveries: deliveries.rows }),
        rowCount: orders.rows.length + purchasing.rows.length + deliveries.rows.length,
        sources: ["mart_bina_work_order_status", "mart_bina_purchase_flow", "mart_bina_delivery_status"],
      };
    }
    case "get_open_purchase_requests": {
      const { rows } = await fetchBinaPurchasing({ search: stringArg(args, "search"), limit: 200 });
      return rowsResult(
        name,
        rows.filter((row) => row.flow_type === "purchase_request" && ((row.remaining_quantity ?? 0) > 0 || row.remaining_quantity === null)).slice(0, limit),
        ["mart_bina_purchase_flow"],
      );
    }
    case "search_purchase_lines": {
      const { rows } = await fetchBinaPurchasing({ search: stringArg(args, "search"), limit });
      return rowsResult(name, rows, ["mart_bina_purchase_flow"]);
    }
    case "get_supplier_aging": {
      const { rows } = await fetchBinaSuppliers({ search: stringArg(args, "search"), limit });
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
      const { rows } = await fetchBinaFinance({ search: stringArg(args, "search"), limit });
      return rowsResult(name, rows.filter((row) => (row.balance ?? 0) > 0), ["mart_bina_finance"]);
    }
    case "get_delivery_status": {
      const { rows } = await fetchBinaDeliveries({ search: stringArg(args, "search"), limit });
      return rowsResult(name, rows, ["mart_bina_delivery_status"]);
    }
    case "get_sales_invoice_summary": {
      const { rows } = await fetchBinaSales({ search: stringArg(args, "search"), limit });
      return rowsResult(name, rows, ["mart_bina_sales_status"]);
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
