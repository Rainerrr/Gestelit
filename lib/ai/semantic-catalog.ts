export type AiDomain =
  | "overview"
  | "production"
  | "purchasing"
  | "suppliers"
  | "finance"
  | "sales"
  | "deliveries"
  | "sync";

export type AiMetricDefinition = {
  id: string;
  domain: AiDomain;
  labelHe: string;
  definitionHe: string;
  sourceViews: string[];
  grain: string;
  aliasesHe: string[];
};

export const AI_METRICS: AiMetricDefinition[] = [
  {
    id: "bina_sync_health",
    domain: "sync",
    labelHe: "בריאות סנכרון BINA",
    definitionHe: "סטטוס עדכניות לכל טבלת BINA לפי זמן הסנכרון האחרון וכמות שורות.",
    sourceViews: ["mart_bina_sync_health", "bina_sync_log"],
    grain: "source_table",
    aliasesHe: ["סנכרון", "עדכניות", "sync", "BINA"],
  },
  {
    id: "risky_work_orders",
    domain: "production",
    labelHe: "פק״עות בסיכון",
    definitionHe: "פק״עות שעברו תאריך אספקה או שיש בהן פערים בין BINA להתקדמות בגסטליט.",
    sourceViews: ["mart_bina_work_order_status", "mart_gestelit_bina_reconciliation"],
    grain: "work_order",
    aliasesHe: ["איחור", "בסיכון", "פקע", "פק״ע", "הזמנה"],
  },
  {
    id: "missing_gestelit_jobs",
    domain: "production",
    labelHe: "פק״עות שלא יובאו",
    definitionHe: "פק״עות שקיימות ב-BINA אך אין להן עבודה מקושרת בגסטליט.",
    sourceViews: ["mart_bina_work_order_status"],
    grain: "work_order",
    aliasesHe: ["לא יובא", "חסר בגסטליט", "יצירת עבודה"],
  },
  {
    id: "purchase_flow",
    domain: "purchasing",
    labelHe: "זרימת רכש",
    definitionHe: "שורות בקשת רכש וקבלות טובין מסונכרנות מ-BINA.",
    sourceViews: ["mart_bina_purchase_flow"],
    grain: "purchase_document_line",
    aliasesHe: ["רכש", "קניות", "בקשות", "טובין", "חומרים"],
  },
  {
    id: "supplier_aging",
    domain: "suppliers",
    labelHe: "יתרות ספקים",
    definitionHe: "יתרה פתוחה ואיחור לפי ספק מתוך טבלת חובות BINA.",
    sourceViews: ["mart_bina_supplier_aging"],
    grain: "supplier_currency",
    aliasesHe: ["ספקים", "חובות ספקים", "יתרה פתוחה", "איחור ספק"],
  },
  {
    id: "sales_status",
    domain: "sales",
    labelHe: "מכירות וחשבוניות לקוח",
    definitionHe: "חשבוניות לקוח, סכומים, לקוחות, אנשי מכירות ותאריכי פירעון.",
    sourceViews: ["mart_bina_sales_status"],
    grain: "customer_invoice",
    aliasesHe: ["מכירות", "חשבוניות לקוח", "לקוח", "סוכן"],
  },
  {
    id: "delivery_status",
    domain: "deliveries",
    labelHe: "משלוחים וספקי חוץ",
    definitionHe: "משלוחים פתוחים/סגורים, תאריכי יציאה, מוביל ומספר מעקב.",
    sourceViews: ["mart_bina_delivery_status"],
    grain: "delivery",
    aliasesHe: ["משלוח", "יצא", "חזר", "ספקי חוץ"],
  },
];

export function getAvailableMetrics() {
  return AI_METRICS;
}

export async function fetchAvailableMetrics() {
  try {
    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from("semantic_bina_metrics")
      .select("id,domain,label_he,definition_he,source_views,grain,aliases_he")
      .eq("is_active", true)
      .order("domain")
      .order("id");

    if (error) throw error;
    return (data ?? []).map((metric) => ({
      id: String(metric.id),
      domain: metric.domain as AiDomain,
      labelHe: String(metric.label_he),
      definitionHe: String(metric.definition_he),
      sourceViews: Array.isArray(metric.source_views) ? metric.source_views.map(String) : [],
      grain: String(metric.grain),
      aliasesHe: Array.isArray(metric.aliases_he) ? metric.aliases_he.map(String) : [],
    } satisfies AiMetricDefinition));
  } catch {
    return AI_METRICS;
  }
}
import { createServiceSupabase } from "@/lib/supabase/client";
