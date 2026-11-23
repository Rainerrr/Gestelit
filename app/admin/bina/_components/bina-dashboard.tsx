"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  BrainCircuit,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Database,
  FileSearch,
  FileWarning,
  Loader2,
  PackageCheck,
  ReceiptText,
  RefreshCcw,
  Ship,
  ShoppingCart,
  Sparkles,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AdminLayout } from "../../_components/admin-layout";
import { AdminPageHeader, MobileBottomBar } from "../../_components/admin-page-header";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  fetchBinaDeliveriesApi,
  fetchBinaFinanceApi,
  fetchBinaFinanceDetailApi,
  fetchBinaFinanceSummaryApi,
  fetchBinaOverviewApi,
  fetchBinaPurchasingApi,
  fetchBinaSavedQuestionsApi,
  fetchBinaSalesApi,
  fetchBinaSuppliersApi,
  fetchBinaSyncStatusApi,
  fetchBinaWorkOrderDetailApi,
  fetchBinaWorkOrdersApi,
  importBinaWorkOrderApi,
} from "@/lib/api/bina";
import type { PipelinePresetWithSteps, Station } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TabId =
  | "overview"
  | "production"
  | "purchasing"
  | "suppliers"
  | "finance"
  | "sales"
  | "deliveries"
  | "ai"
  | "sync";

type AnyRow = Record<string, unknown>;

type DashboardSummary = {
  coverage?: AnyRow;
  coverageStatus?: string;
  overview?: AnyRow;
  risks?: AnyRow[];
  dataQuality?: AnyRow[];
  dataQualityStatus?: "complete" | "partial";
  financeByConfidence?: AnyRow[];
  purchaseMetrics?: AnyRow[];
  deliveryMetrics?: AnyRow[];
};

const chartColors = ["#3b82f6", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6", "#06b6d4"];

const tabOptions = [
  { id: "overview", label: "סקירה", icon: BarChart3 },
  { id: "production", label: "פק״עות", icon: FileSearch },
  { id: "purchasing", label: "רכש", icon: ShoppingCart },
  { id: "suppliers", label: "ספקים", icon: Building2 },
  { id: "finance", label: "כספים", icon: WalletCards },
  { id: "sales", label: "מכירות", icon: ReceiptText },
  { id: "deliveries", label: "משלוחים", icon: Ship },
  { id: "ai", label: "AI", icon: BrainCircuit },
  { id: "sync", label: "סנכרון", icon: Database },
] satisfies Array<{ id: TabId; label: string; icon: typeof BarChart3 }>;

function formatNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString("he-IL") : "0";
}

function numberValue(value: unknown) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value: unknown, currency?: unknown) {
  if (value === null || value === undefined || value === "") return "לא ידוע";
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return "לא ידוע";
  const currencyCode = String(currency || "ILS");
  if (hasBadEncoding(currencyCode)) {
    return `${number.toLocaleString("he-IL", { maximumFractionDigits: 2 })} מטבע לא מזוהה`;
  }
  if (currencyCode === "ILS" || currencyCode === "" || currencyCode === "null") {
    return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(number);
  }
  return `${number.toLocaleString("he-IL", { maximumFractionDigits: 2 })} ${currencyCode}`;
}

function formatCompactMoney(value: unknown, currency?: unknown) {
  if (value === null || value === undefined || value === "") return "לא ידוע";
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return "לא ידוע";
  const currencyCode = String(currency || "ILS");
  const formatted = new Intl.NumberFormat("he-IL", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(number);
  if (currencyCode === "ILS" || currencyCode === "" || currencyCode === "null") return `₪${formatted}`;
  if (hasBadEncoding(currencyCode)) return `${formatted} מטבע לא מזוהה`;
  return `${formatted} ${currencyCode}`;
}

function formatDate(value: unknown, withTime = false) {
  if (!value || typeof value !== "string") return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("he-IL", {
    day: "numeric", month: "long", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" } as const : { timeZone: "UTC" }),
  }).format(date);
}

function statusLabel(status: string | null | undefined) {
  switch (status) {
    case "linked":
      return "מקושר";
    case "not_imported":
      return "טרם נפתחה עבודה";
    case "quantity_mismatch":
      return "פער כמות";
    case "at_risk":
      return "בסיכון";
    default:
      return status ?? "-";
  }
}

function valueLabel(value: unknown) {
  switch (String(value ?? "")) {
    case "new_candidate":
      return "לבחירה ולהכנת עבודה";
    case "not_imported":
      return "טרם נפתחה עבודה";
    case "purchase_request":
      return "בקשת רכש";
    case "goods_receipt":
      return "קבלת טובין";
    case "customer_invoice":
      return "חשבונית לקוח";
    case "supplier_invoice":
      return "חשבונית ספק";
    case "debt":
      return "חוב פתוח";
    case "receivable":
      return "גבייה";
    case "payable":
      return "תשלום יוצא";
    case "customer":
      return "לקוח";
    case "supplier":
      return "ספק";
    case "open":
      return "פתוח";
    case "open_inferred":
      return "פתוח משוער";
    case "paid":
      return "שולם";
    case "overdue":
      return "באיחור";
    case "unknown":
      return "לא ידוע";
    case "valid":
      return "תקין";
    case "missing":
      return "חסר";
    case "suspicious":
      return "חשוד";
    case "exact":
      return "מדויק";
    case "inferred":
      return "משוער";
    case "missing_data":
      return "חסר נתון";
    case "returned_or_received":
      return "חזר / התקבל";
    case "sent_open":
      return "יצא ופתוח";
    case "draft_or_unknown":
      return "טיוטה / לא ידוע";
    case "ok":
      return "תקין";
    case "stale":
      return "מיושן";
    case "empty":
      return "ריק";
    case "blocked":
      return "חסום";
    case "blocked_partial_sample":
      return "מדגם חסום";
    case "recent_window":
      return "חלון אחרון";
    case "full_snapshot":
      return "צילום מלא";
    case "missing_import":
      return "לא יובא";
    case "quantity_mismatch":
      return "פער כמות";
    case "late_or_unfinished":
      return "מאחר / לא הושלם";
    case "material_or_purchase_open":
      return "חסום רכש";
    case "sent_open_delivery":
      return "משלוח פתוח";
    case "finance_attention":
      return "כספים לבדיקה";
    case "missing_route_rows":
      return "חסר מסלול";
    case "ready_or_linked":
      return "מוכן / מקושר";
    case "ready_inferred_inventory":
      return "מוכן לפי מלאי";
    case "purchase_requested":
      return "בקשת רכש פתוחה";
    case "short_or_unknown":
      return "חסר / לא ידוע";
    case "production":
      return "ייצור";
    case "purchasing":
      return "רכש";
    case "logistics":
      return "לוגיסטיקה";
    case "finance":
      return "כספים";
    case "system":
      return "מערכת";
    case "partial_sample":
      return "מדגם חלקי";
    case "complete":
      return "כיסוי מלא";
    case "fallback":
      return "גיבוי";
    default:
      return String(value ?? "-");
  }
}

function statusVariant(status: string | null | undefined) {
  if (status === "linked" || status === "ok" || status === "paid" || status === "valid" || status === "exact" || status === "ready_inferred_inventory") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (status === "not_imported" || status === "missing_import" || status === "stale" || status === "sent_open" || status === "open" || status === "open_inferred" || status === "missing" || status === "unknown" || status === "material_or_purchase_open" || status === "sent_open_delivery" || status === "missing_route_rows" || status === "partial_sample" || status === "fallback" || status === "inferred" || status === "missing_data" || status === "purchase_requested") return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  if (status === "quantity_mismatch" || status === "late_or_unfinished" || status === "at_risk" || status === "empty" || status === "blocked" || status === "blocked_partial_sample" || status === "overdue" || status === "suspicious" || status === "short_or_unknown") return "bg-red-500/10 text-red-400 border-red-500/20";
  return "bg-muted text-muted-foreground border-border";
}

function hasBadEncoding(value: unknown) {
  return typeof value === "string" && /\?{3,}/.test(value);
}

function financeFilterParams(filter: string) {
  switch (filter) {
    case "open":
      return { openOnly: true };
    case "customers":
      return { partyType: "customer" };
    case "suppliers":
      return { partyType: "supplier" };
    case "customer_invoice":
      return { kind: "customer_invoice" };
    case "supplier_invoice":
      return { kind: "supplier_invoice" };
    case "overdue":
      return { overdueOnly: true };
    case "exceptions":
      return { dateQuality: "suspicious" };
    default:
      return {};
  }
}

const financeFilterOptions = [
  { id: "all", label: "הכל" },
  { id: "open", label: "חובות פתוחים" },
  { id: "customers", label: "לקוחות" },
  { id: "suppliers", label: "ספקים" },
  { id: "customer_invoice", label: "חשבוניות לקוח" },
  { id: "supplier_invoice", label: "חשבוניות ספק" },
  { id: "overdue", label: "באיחור" },
  { id: "exceptions", label: "דורש בדיקה" },
];

function summarizeSyncResult(results: unknown) {
  if (!results || typeof results !== "object") return "-";
  const entries = Object.entries(results as Record<string, { upserted?: number; error?: string }>);
  const failures = entries.filter(([, result]) => result?.error);
  const upserted = entries.reduce((sum, [, result]) => sum + Number(result?.upserted ?? 0), 0);
  if (failures.length > 0) {
    return `${failures.length} שגיאות, ${formatNumber(upserted)} שורות נקלטו`;
  }
  return `${formatNumber(upserted)} שורות נקלטו, ${entries.length} טבלאות`;
}

function syncFailureDetails(results: unknown) {
  if (!results || typeof results !== "object") return [];
  return Object.entries(results as Record<string, { error?: string }>)
    .filter(([, result]) => result?.error)
    .slice(0, 3)
    .map(([table, result]) => `${table}: ${String(result.error)}`);
}


async function readAdminJson(response: Response, fallbackError: string) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : fallbackError);
  return payload;
}

function detailValue(label: string, value: ReactNode) {
  return (
    <div className="rounded-lg border border-border bg-background/70 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 min-h-6 text-sm font-medium">{value ?? "-"}</div>
    </div>
  );
}

const KpiCard = ({
  label,
  value,
  icon: Icon,
  hint,
  tone = "primary",
}: {
  label: string;
  value: string | number;
  icon: typeof BarChart3;
  hint?: ReactNode;
  tone?: "primary" | "amber" | "red" | "emerald" | "blue";
}) => {
  const toneClass = {
    primary: "bg-primary/10 text-primary border-primary/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  }[tone];

  return (
    <Card className="rounded-xl border border-border bg-card/50 p-4">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg border", toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="break-words font-mono text-lg font-semibold leading-tight tabular-nums sm:text-2xl">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
      </div>
    </Card>
  );
};

function Bdi({ children }: { children: ReactNode }) {
  return <bdi dir="auto">{children ?? "-"}</bdi>;
}

function MiniChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <Card className="min-w-0 overflow-hidden rounded-xl border border-border bg-card/50 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </Card>
  );
}

function MetricBreakdownBar({
  data,
  labelKey = "label",
  valueKey = "value",
}: {
  data: AnyRow[];
  labelKey?: string;
  valueKey?: string;
}) {
  const total = data.reduce((sum, row) => sum + numberValue(row[valueKey]), 0);
  if (total <= 0) {
    return <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">אין מספיק נתונים להצגה</div>;
  }
  return (
    <div className="space-y-3">
      {data.map((row, index) => {
        const value = numberValue(row[valueKey]);
        const percent = Math.round((value / total) * 100);
        return (
          <div key={`${String(row[labelKey])}-${index}`} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span>{String(row[labelKey] ?? "-")}</span>
              <span className="font-mono tabular-nums">{formatNumber(value)} · {percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{ width: `${percent}%`, backgroundColor: chartColors[index % chartColors.length] }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SimpleDonut({ data }: { data: Array<{ label: string; value: number }> }) {
  const visible = data.filter((item) => item.value > 0);
  if (visible.length === 0) {
    return <div className="flex h-52 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">אין נתונים לתרשים</div>;
  }
  return (
    <div dir="ltr" className="h-56 min-h-56 min-w-0 overflow-hidden [direction:ltr]">
      <ResponsiveContainer width="100%" height={224}>
        <PieChart>
          <Pie data={visible} dataKey="value" nameKey="label" innerRadius={54} outerRadius={82} paddingAngle={3}>
            {visible.map((_, index) => (
              <Cell key={index} fill={chartColors[index % chartColors.length]} stroke="hsl(var(--card))" />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
            formatter={(value: number, name: string) => [formatNumber(value), name]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function SimpleBarChart({ data, valueKey, labelKey }: { data: AnyRow[]; valueKey: string; labelKey: string }) {
  const visible = data.filter((row) => numberValue(row[valueKey]) > 0).slice(0, 8);
  if (visible.length === 0) {
    return <div className="flex h-52 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">אין נתונים לתרשים</div>;
  }
  return (
    <div dir="ltr" className="h-64 min-h-64 min-w-0 overflow-hidden [direction:ltr]">
      <ResponsiveContainer width="100%" height={256}>
        <BarChart data={visible} margin={{ top: 8, right: 8, left: 8, bottom: 20 }}>
          <XAxis dataKey={labelKey} tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
            formatter={(value: number) => formatNumber(value)}
          />
          <Bar dataKey={valueKey} fill="#3b82f6" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DataQualityBanner({
  dashboard,
  syncRows,
}: {
  dashboard: DashboardSummary | null;
  syncRows: AnyRow[];
}) {
  const quality = Array.isArray(dashboard?.dataQuality) ? dashboard.dataQuality : [];
  const coverageStatus = String(dashboard?.coverageStatus ?? "partial_sample");
  const partialTables = numberValue(dashboard?.coverage?.partial_tables);
  const staleTables = syncRows.filter((row) => row.freshness_status === "stale").length;
  const emptyTables = syncRows.filter((row) => row.freshness_status === "empty").length;
  const shouldShow = coverageStatus !== "complete" || partialTables > 0 || staleTables > 0 || emptyTables > 0 || quality.length > 0;
  if (!shouldShow) return null;

  return (
    <Card className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-950 dark:text-amber-100">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-semibold">אמינות נתונים: יש להתייחס לנתוני BINA כמדגם/חלון אחרון עד להוכחת כיסוי מלא</div>
          <div className="mt-1 text-amber-800 dark:text-amber-100/80">
            {partialTables > 0 && `${formatNumber(partialTables)} טבלאות מסומנות כסנכרון חלקי. `}
            {staleTables > 0 && `${formatNumber(staleTables)} טבלאות מיושנות. `}
            {emptyTables > 0 && `${formatNumber(emptyTables)} טבלאות ריקות. `}
            {quality.length > 0 && `${formatNumber(quality.length)} סוגי חריגות איכות נתונים נמצאו. `}
            {dashboard?.dataQualityStatus !== "complete" && "בדיקת האיכות המלאה לא נטענה; היעדר חריגות בתצוגה אינו אישור לתקינות."}
          </div>
        </div>
      </div>
    </Card>
  );
}

function OperationalQueue({
  title,
  rows,
  emptyText = "אין חריגות בולטות כרגע.",
  onAsk,
}: {
  title: string;
  rows: AnyRow[];
  emptyText?: string;
  onAsk?: (row: AnyRow) => void;
}) {
  return (
    <Card className="rounded-xl border border-border bg-card/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">ממויין לפי סיכון תפעולי ולא לפי סדר טבלאי</p>
        </div>
        <FileWarning className="h-5 w-5 text-amber-400" />
      </div>
      <div className="space-y-2">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-background/60 p-3 text-sm text-muted-foreground">{emptyText}</div>
        ) : rows.slice(0, 8).map((row, index) => (
          <div key={String(row.risk_id ?? row.bina_id ?? row.entity_key ?? index)} className="rounded-lg border border-border bg-background/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{String(row.entity_label ?? row.party_name ?? row.customer_name ?? row.supplier_name ?? row.document_no ?? "-")}</div>
                <div className="mt-1 text-xs text-muted-foreground">{String(row.risk_reason ?? row.reason ?? row.status_he ?? "-")}</div>
              </div>
              <Badge className={statusVariant(String(row.severity === "high" ? "at_risk" : row.severity === "medium" ? "open" : "ok"))}>
                {row.severity === "high" ? "גבוה" : row.severity === "medium" ? "בינוני" : "נמוך"}
              </Badge>
            </div>
            {onAsk && (
              <Button type="button" variant="ghost" size="sm" className="mt-2 h-8 px-2 text-xs" onClick={() => onAsk(row)}>
                שאל AI על זה
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function RelationshipSummary({
  order,
  detail,
}: {
  order: AnyRow | null;
  detail: AnyRow | null;
}) {
  const routeSummary = ((detail?.routeSummary as AnyRow | undefined) ?? {}) as AnyRow;
  const relatedPurchasing = Array.isArray(detail?.relatedPurchasing) ? detail.relatedPurchasing.length : numberValue(order?.purchase_request_count) + numberValue(order?.goods_receipt_count);
  const relatedDeliveries = Array.isArray(detail?.relatedDeliveries) ? detail.relatedDeliveries.length : numberValue(order?.delivery_count);
  const relatedFinance = Array.isArray(detail?.relatedFinance) ? detail.relatedFinance.length : numberValue(order?.finance_document_count);
  const relatedSales = Array.isArray(detail?.relatedSales) ? detail.relatedSales.length : numberValue(order?.invoice_count);

  return (
    <Card className="rounded-xl border border-border bg-background/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">מפת קשרים תפעולית</h3>
          <p className="text-xs text-muted-foreground">פק״ע → רצפה → רכש/ספקים → משלוחים → כספים</p>
        </div>
        <Badge className={statusVariant(String(order?.relationship_confidence))}>אמינות: {valueLabel(order?.relationship_confidence)}</Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-5">
        {[
          ["Gestelit", order?.gestelit_job_number ? `עבודה ${String(order.gestelit_job_number)}` : "לא מקושר"],
          ["מסלול", `${formatNumber(order?.route_row_count ?? routeSummary.rowCount ?? 0)} שורות`],
          ["רכש", `${formatNumber(relatedPurchasing)} קשרים`],
          ["משלוחים", `${formatNumber(relatedDeliveries)} קשרים`],
          ["כספים", `${formatNumber(relatedFinance + relatedSales)} קשרים`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-card/60 p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 text-sm font-medium"><Bdi>{value}</Bdi></div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SimpleTable({
  rows,
  columns,
  isLoading,
  onRowClick,
}: {
  rows: AnyRow[];
  columns: Array<{ key: string; label: string; render?: (row: AnyRow) => ReactNode }>;
  isLoading?: boolean;
  onRowClick?: (row: AnyRow) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card/50">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.key}>{column.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="py-12 text-center text-muted-foreground">
                טוען נתונים...
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="py-12 text-center text-muted-foreground">
                אין נתונים להצגה
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, index) => (
              <TableRow
                key={String(row.bina_id ?? row.id ?? index)}
                onClick={() => onRowClick?.(row)}
                className={onRowClick ? "cursor-pointer" : undefined}
              >
                {columns.map((column) => (
                  <TableCell key={column.key}>
                    {column.render ? column.render(row) : <bdi dir="auto">{String(row[column.key] ?? "-")}</bdi>}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function SearchBand({
  value,
  onChange,
  onRefresh,
}: {
  value: string;
  onChange: (value: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card/50 p-3 sm:flex-row">
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="חיפוש לפי לקוח, ספק, פריט, פק״ע או מסמך"
        className="bg-background"
      />
      <Button variant="outline" onClick={onRefresh} className="gap-2">
        <RefreshCcw className="h-4 w-4" />
        רענון
      </Button>
    </div>
  );
}

function FinanceWorkbench({
  rows,
  summary,
  filter,
  isLoading,
  onFilterChange,
  onRefresh,
  onRowClick,
  onAsk,
}: {
  rows: AnyRow[];
  summary: AnyRow | null;
  filter: string;
  isLoading: boolean;
  onFilterChange: (filter: string) => void;
  onRefresh: () => void;
  onRowClick: (row: AnyRow) => void;
  onAsk: (prompt: string) => void;
}) {
  const totals = (summary?.totals ?? {}) as AnyRow;
  const primaryCurrency = String(summary?.primaryCurrency ?? "ILS");
  const exceptions = Array.isArray(summary?.exceptions) ? summary.exceptions as AnyRow[] : [];
  const currencies = Array.isArray(summary?.currencies) ? summary.currencies as AnyRow[] : [];
  const suspiciousCount = Number(totals.suspiciousDateCount ?? 0);
  const visibleBadTextCount = rows.filter((row) => hasBadEncoding(row.party_name)).length;
  const hasMultipleCurrencies = currencies.length > 1;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        <KpiCard label="חוב לקוחות פתוח" value={formatCompactMoney(totals.receivableOpen, primaryCurrency)} icon={CircleDollarSign} tone="blue" />
        <KpiCard label="גבייה באיחור" value={formatCompactMoney(totals.receivableOverdue, primaryCurrency)} icon={AlertTriangle} tone="red" />
        <KpiCard label="תשלומים פתוחים" value={formatCompactMoney(totals.payableOpen, primaryCurrency)} icon={WalletCards} tone="amber" />
        <KpiCard label="ספקים באיחור" value={formatCompactMoney(totals.payableOverdue, primaryCurrency)} icon={Building2} tone="red" />
        <KpiCard label="פירעון השבוע" value={formatCompactMoney(totals.dueThisWeek, primaryCurrency)} icon={CalendarClock} tone="emerald" />
        <KpiCard label="חריגות נתונים" value={formatNumber(totals.suspiciousDateCount)} icon={FileWarning} tone={suspiciousCount > 0 ? "red" : "emerald"} />
      </div>

      {(suspiciousCount > 0 || visibleBadTextCount > 0 || hasMultipleCurrencies) && (
        <Card className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold">איכות נתוני BINA דורשת בדיקה</div>
              <div className="mt-1 text-amber-100/80">
                {suspiciousCount > 0 && `${formatNumber(suspiciousCount)} מסמכים עם תאריכים חשודים אינם נכנסים לחישובי גיל חוב. `}
                {visibleBadTextCount > 0 && "חלק משמות הלקוחות/ספקים עדיין מוצגים כ-???? עד להרצת סנכרון UTF-8 נקי."}
                {hasMultipleCurrencies && ` קיימים ${formatNumber(currencies.length)} מטבעות/קבוצות מטבע ולכן ה-KPI מוצגים במטבע המרכזי בלבד.`}
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/50 p-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          {financeFilterOptions.map((option) => (
            <Button
              key={option.id}
              type="button"
              size="sm"
              variant={filter === option.id ? "default" : "outline"}
              onClick={() => onFilterChange(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onAsk("מצא חריגות כספיות ב-BINA והסבר מה לבדוק קודם")} className="gap-2">
            <Sparkles className="h-4 w-4" />
            מצא חריגות כספיות
          </Button>
          <Button variant="outline" size="sm" onClick={onRefresh} className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            רענון
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <div className="hidden md:block">
            <SimpleTable
              rows={rows}
              isLoading={isLoading}
              onRowClick={onRowClick}
              columns={[
                { key: "document_type_label", label: "סוג", render: (row) => <Badge className={statusVariant(String(row.paid_status))}>{String(row.document_type_label ?? valueLabel(row.kind))}</Badge> },
                { key: "document_no", label: "מסמך" },
                { key: "party_name", label: "לקוח/ספק", render: (row) => <bdi dir="auto" className={cn(hasBadEncoding(row.party_name) && "text-amber-300")}>{String(row.party_name ?? "-")}</bdi> },
                { key: "due_at", label: "פירעון", render: (row) => formatDate(row.due_at) },
                { key: "open_amount", label: "יתרה", render: (row) => formatMoney(row.open_amount, row.currency_group) },
                { key: "aging_bucket", label: "גיל חוב", render: (row) => <Badge className={statusVariant(String(row.paid_status))}>{String(row.aging_bucket ?? "-")}</Badge> },
                { key: "date_quality", label: "איכות", render: (row) => <Badge className={statusVariant(String(row.date_quality))}>{valueLabel(row.date_quality)}</Badge> },
                { key: "risk_reason", label: "סיבה", render: (row) => <span className="line-clamp-2 text-sm text-muted-foreground">{String(row.risk_reason ?? "-")}</span> },
              ]}
            />
          </div>

          <div className="space-y-3 md:hidden">
            {isLoading ? (
              <Card className="rounded-xl border border-border bg-card/50 p-6 text-center text-muted-foreground">טוען נתונים...</Card>
            ) : rows.length === 0 ? (
              <Card className="rounded-xl border border-border bg-card/50 p-6 text-center text-muted-foreground">אין נתונים להצגה</Card>
            ) : rows.map((row, index) => (
              <button
                key={String(row.bina_id ?? index)}
                type="button"
                onClick={() => onRowClick(row)}
                className="w-full rounded-xl border border-border bg-card/50 p-4 text-right"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{String(row.party_name ?? "ללא שם")}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {String(row.document_type_label ?? valueLabel(row.kind))} · מסמך <bdi dir="ltr">{String(row.document_no ?? "-")}</bdi>
                    </div>
                  </div>
                  <Badge className={statusVariant(String(row.paid_status))}>{valueLabel(row.paid_status)}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">יתרה</div>
                    <div className="font-mono tabular-nums">{formatMoney(row.open_amount, row.currency_group)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">פירעון</div>
                    <div>{formatDate(row.due_at)}</div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">{String(row.risk_reason ?? "")}</div>
              </button>
            ))}
          </div>
        </div>

        <Card className="rounded-xl border border-border bg-card/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">דורש טיפול</h3>
              <p className="text-xs text-muted-foreground">חריגות לפי סיכון, פירעון ואיכות נתונים</p>
            </div>
            <FileWarning className="h-5 w-5 text-amber-400" />
          </div>
          <div className="space-y-2">
            {exceptions.length === 0 ? (
              <div className="rounded-lg border border-border bg-background/60 p-3 text-sm text-muted-foreground">אין חריגות בולטות כרגע.</div>
            ) : exceptions.slice(0, 6).map((row) => (
              <button
                key={String(row.bina_id)}
                type="button"
                onClick={() => onRowClick(row)}
                className="w-full rounded-lg border border-border bg-background/60 p-3 text-right transition hover:bg-accent"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{String(row.party_name ?? row.document_no ?? "-")}</span>
                  <Badge className={statusVariant(String(row.date_quality === "valid" ? row.paid_status : row.date_quality))}>
                    {row.date_quality === "valid" ? valueLabel(row.paid_status) : valueLabel(row.date_quality)}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{String(row.risk_reason ?? "")}</div>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export const BinaDashboard = () => {
  const { hasAccess } = useAdminGuard();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [overview, setOverview] = useState<AnyRow | null>(null);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [financeSummary, setFinanceSummary] = useState<AnyRow | null>(null);
  const [financeFilter, setFinanceFilter] = useState("all");
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [syncRows, setSyncRows] = useState<AnyRow[]>([]);
  const [syncCoverageRows, setSyncCoverageRows] = useState<AnyRow[]>([]);
  const [syncQualityRows, setSyncQualityRows] = useState<AnyRow[]>([]);
  const [syncLogs, setSyncLogs] = useState<AnyRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [includeHistory, setIncludeHistory] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<AnyRow | null>(null);
  const orderRequest = useRef(0);
  const [orderDetail, setOrderDetail] = useState<AnyRow | null>(null);
  const [selectedFinance, setSelectedFinance] = useState<AnyRow | null>(null);
  const [financeDetail, setFinanceDetail] = useState<AnyRow | null>(null);
  const [financeDetailError, setFinanceDetailError] = useState<string | null>(null);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [pipelinePresets, setPipelinePresets] = useState<PipelinePresetWithSteps[]>([]);
  const [availableStations, setAvailableStations] = useState<Station[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("none");
  const [selectedStationIds, setSelectedStationIds] = useState<string[]>([]);
  const [readinessConfirmed, setReadinessConfirmed] = useState(false);
  const [importPreview, setImportPreview] = useState<AnyRow | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<AnyRow | null>(null);
  const [savedQuestions, setSavedQuestions] = useState<Array<{ id: string; title_he: string; prompt_he: string; domain: string }>>([]);

  const capsules = useMemo(() => ({
    options: tabOptions,
    activeId: activeTab,
    onChange: (id: string) => setActiveTab(id as TabId),
  }), [activeTab]);

  const loadOverview = useCallback(async () => {
    const data = await fetchBinaOverviewApi() as { overview: AnyRow; dashboard?: DashboardSummary };
    setOverview(data.overview);
    setDashboardSummary(data.dashboard ?? null);
    const metricTrustRows = Array.isArray(data.dashboard?.overview?.metric_trust)
      ? data.dashboard.overview.metric_trust as AnyRow[]
      : [];
    if (metricTrustRows.length > 0) {
      const rowsFromTrust = metricTrustRows.map((row) => ({
        source_table: row.source_table,
        storage_table: row.storage_table,
        row_count: numberValue(row.upserted_count ?? row.sent_count),
        last_row_synced_at: row.last_table_sync_at,
        age_seconds: row.age_seconds,
        freshness_status: row.freshness_status ?? "empty",
      }));
      const coverageFromTrust = metricTrustRows.map((row) => ({
        ...row,
        row_count: numberValue(row.upserted_count ?? row.sent_count),
        last_row_synced_at: row.last_table_sync_at,
        coverage_note: row.trust_note,
      }));
      setSyncRows((current) => (current.length > 0 ? current : rowsFromTrust));
      setSyncCoverageRows((current) => (current.length > 0 ? current : coverageFromTrust));
    }
  }, []);

  const loadSavedQuestions = useCallback(async () => {
    try {
      const data = await fetchBinaSavedQuestionsApi() as { questions: Array<{ id: string; title_he: string; prompt_he: string; domain: string }> };
      setSavedQuestions(Array.isArray(data.questions) ? data.questions : []);
    } catch {
      setSavedQuestions([]);
    }
  }, []);

  const loadCurrent = useCallback(async () => {
    if (hasAccess !== true) return;
    setIsLoading(true);
    setLoadError(null);
    if (activeTab !== "overview") {
      setRows([]);
    }
    try {
      if (activeTab === "overview") {
        await loadOverview();
        const data = await fetchBinaWorkOrdersApi({ limit: 12, incoming: true }) as { rows: AnyRow[] };
        setRows(data.rows);
      } else if (activeTab === "production") {
        const data = await fetchBinaWorkOrdersApi({ search, limit: 80, history: includeHistory ? "all" : undefined }) as { rows: AnyRow[] };
        setRows(data.rows);
      } else if (activeTab === "purchasing") {
        const data = await fetchBinaPurchasingApi({ search, limit: 80 }) as { rows: AnyRow[] };
        setRows(data.rows);
      } else if (activeTab === "suppliers") {
        const data = await fetchBinaSuppliersApi({ search, limit: 80 }) as { rows: AnyRow[] };
        setRows(data.rows);
      } else if (activeTab === "finance") {
        const [summaryData, data] = await Promise.all([
          fetchBinaFinanceSummaryApi() as Promise<AnyRow>,
          fetchBinaFinanceApi({ search, limit: 80, ...financeFilterParams(financeFilter) }) as Promise<{ rows: AnyRow[] }>,
        ]);
        setFinanceSummary(summaryData);
        setRows(data.rows);
      } else if (activeTab === "sales") {
        const data = await fetchBinaSalesApi({ search, limit: 80 }) as { rows: AnyRow[] };
        setRows(data.rows);
      } else if (activeTab === "deliveries") {
        const data = await fetchBinaDeliveriesApi({ search, limit: 80 }) as { rows: AnyRow[] };
        setRows(data.rows);
      } else if (activeTab === "ai" && savedQuestions.length === 0) {
        await loadSavedQuestions();
      } else if (activeTab === "sync") {
        const data = await fetchBinaSyncStatusApi() as { tables: AnyRow[]; coverage?: AnyRow[]; dataQuality?: AnyRow[]; logs: AnyRow[] };
        setSyncRows(data.tables);
        setSyncCoverageRows(Array.isArray(data.coverage) ? data.coverage : []);
        setSyncQualityRows(Array.isArray(data.dataQuality) ? data.dataQuality : []);
        setSyncLogs(data.logs);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "BINA_REQUEST_FAILED");
      if (activeTab !== "overview") setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, financeFilter, hasAccess, includeHistory, loadOverview, loadSavedQuestions, savedQuestions.length, search]);

  useEffect(() => {
    void loadCurrent();
  }, [loadCurrent]);

  const openOrder = async (row: AnyRow) => {
    const request = ++orderRequest.current;
    setSelectedOrder(row);
    setOrderDetail(null);
    setImportPreview(null);
    setReadinessConfirmed(false);
    setShowImportPanel(false);
    setImportError(null);
    setDetailError(null);
    setImportResult(null);
    try {
      const detail = await fetchBinaWorkOrderDetailApi(String(row.bina_id)) as AnyRow;
      if (request === orderRequest.current) setOrderDetail(detail);
    } catch (error) {
      if (request === orderRequest.current) setDetailError(error instanceof Error ? error.message : "BINA_WORK_ORDER_DETAIL_FAILED");
    }
  };

  const openFinanceRow = async (row: AnyRow) => {
    setSelectedFinance(row);
    setFinanceDetail(null);
    setFinanceDetailError(null);
    try {
      const detail = await fetchBinaFinanceDetailApi(String(row.bina_id), typeof row.kind === "string" ? row.kind : null) as AnyRow;
      setFinanceDetail(detail);
    } catch (error) {
      setFinanceDetailError(error instanceof Error ? error.message : "BINA_FINANCE_DETAIL_FAILED");
    }
  };

  const loadImportOptions = async () => {
    const [presetResponse, stationResponse] = await Promise.all([
      fetch("/api/admin/pipeline-presets", { credentials: "include" }).then((response) => readAdminJson(response, "PIPELINE_PRESETS_FAILED")),
      fetch("/api/admin/pipeline-presets/available-stations", { credentials: "include" }).then((response) => readAdminJson(response, "PIPELINE_STATIONS_FAILED")),
    ]);
    setPipelinePresets(Array.isArray(presetResponse.presets) ? presetResponse.presets : []);
    setAvailableStations(Array.isArray(stationResponse.stations) ? stationResponse.stations : []);
  };

  const importSelectedOrder = async () => {
    if (!selectedOrder) return;
    setImportError(null);
    setImportResult(null);
    setShowImportPanel(true);
    try {
      if (pipelinePresets.length === 0 && availableStations.length === 0) {
        await loadImportOptions();
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "IMPORT_OPTIONS_FAILED");
    }
  };

  const toggleStation = (stationId: string) => {
    setImportPreview(null); setReadinessConfirmed(false);
    setSelectedStationIds((current) =>
      current.includes(stationId)
        ? current.filter((id) => id !== stationId)
        : [...current, stationId],
    );
  };

  const confirmImport = async (commit = false) => {
    if (!selectedOrder) return;
    if (selectedPresetId === "none" && selectedStationIds.length === 0) {
      setImportError("בחר תבנית או לפחות תחנה אחת לפני יצירת עבודה בגסטליט.");
      return;
    }

    setIsImporting(true);
    setImportError(null);
    try {
      const result = await importBinaWorkOrderApi(String(selectedOrder.bina_id), {
        pipeline_preset_id: selectedPresetId === "none" ? null : selectedPresetId,
        station_ids: selectedPresetId === "none" ? selectedStationIds : [],
        dryRun: !commit,
        previewHash: typeof importPreview?.previewHash === "string" ? importPreview.previewHash : undefined,
        readinessConfirmed,
      }) as AnyRow;
      if (commit) {
        setImportResult(result); setImportPreview(null);
        const request = ++orderRequest.current;
        setOrderDetail(null);
        await fetchBinaWorkOrderDetailApi(String(selectedOrder.bina_id)).then((detail) => {
          if (request === orderRequest.current) setOrderDetail(detail as AnyRow);
        }).catch(() => setDetailError("העבודה נשמרה, אך יש לרענן את הפירוט"));
        await loadCurrent();
      }
      else { setImportPreview(result); setReadinessConfirmed(false); }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "IMPORT_FAILED");
    } finally {
      setIsImporting(false);
    }
  };

  const sendAi = (prompt?: string) => {
    window.dispatchEvent(new CustomEvent("gestelit:admin-ai-open", { detail: { prompt } }));
  };

  if (hasAccess === null) {
    return <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">טוען הרשאות...</div>;
  }

  if (hasAccess === false) return null;

  const overviewData = overview as {
    sync?: AnyRow;
    workOrders?: AnyRow;
    purchasing?: AnyRow;
    suppliers?: AnyRow;
    sales?: AnyRow;
    deliveries?: AnyRow;
  } | null;

  const headerActions = (
    <div className="flex items-center gap-2">
    <Link href="/admin/bina/weekly" className="rounded-lg border px-3 py-2 text-sm font-medium">סקירה שבועית</Link>
    <Button variant="outline" onClick={() => setActiveTab("ai")} className="gap-2">
      <Sparkles className="h-4 w-4" />
      שאל את BINA
    </Button>
    </div>
  );
  const drawerOrder = ((orderDetail?.order as AnyRow | undefined) ?? selectedOrder) as AnyRow | null;
  const drawerDecision = ((orderDetail?.decision as AnyRow | undefined) ?? selectedOrder) as AnyRow | null;
  const drawerFinance = ((financeDetail?.transaction as AnyRow | undefined) ?? selectedFinance) as AnyRow | null;
  const drawerProductionRows = Array.isArray(orderDetail?.productionRows) ? orderDetail.productionRows as AnyRow[] : [];
  const drawerPurchasingRows = Array.isArray(orderDetail?.relatedPurchasing) ? orderDetail.relatedPurchasing as AnyRow[] : [];
  const drawerDeliveryRows = Array.isArray(orderDetail?.relatedDeliveries) ? orderDetail.relatedDeliveries as AnyRow[] : [];
  const drawerFinanceRows = Array.isArray(orderDetail?.relatedFinance) ? orderDetail.relatedFinance as AnyRow[] : [];
  const drawerSalesRows = Array.isArray(orderDetail?.relatedSales) ? orderDetail.relatedSales as AnyRow[] : [];
  const drawerRouteSummary = ((orderDetail?.routeSummary as AnyRow | undefined) ?? {}) as AnyRow;
  const binaImportEnabled = true;
  const aiContext = {
    screen: "נתוני BINA",
    activeTab,
    search: search || null,
    selectedEntity: drawerFinance
      ? {
          type: "finance_document",
          bina_id: drawerFinance.bina_id,
          kind: drawerFinance.kind,
          document_no: drawerFinance.document_no,
          party_name: drawerFinance.party_name,
          due_at: drawerFinance.due_at,
          risk_reason: drawerFinance.risk_reason,
        }
      : drawerOrder
      ? {
          type: "work_order",
          bina_id: drawerOrder.bina_id,
          work_order_id: drawerOrder.work_order_id,
          customer_name: drawerOrder.customer_name,
          link_status: drawerOrder.link_status,
          due_at: drawerOrder.due_at,
        }
      : null,
    visibleSummary: [
      `tab=${activeTab}`,
      overviewData?.sync?.lastSyncedAt ? `lastSync=${String(overviewData.sync.lastSyncedAt)}` : null,
      `manufacturingSince=2024-11-01; historicalSearch=${includeHistory}; not-imported is not a backlog or risk; suggest latest open BINA arrivals by received_at`,
      rows.length ? `visibleRows=${rows.length}` : null,
    ].filter(Boolean).join("; "),
  };

  const dashboardMetricTrustRows = Array.isArray(dashboardSummary?.overview?.metric_trust)
    ? dashboardSummary.overview.metric_trust as AnyRow[]
    : [];
  const effectiveSyncRows: AnyRow[] = syncRows.length > 0
    ? syncRows
    : dashboardMetricTrustRows.map((row) => ({
        source_table: row.source_table,
        storage_table: row.storage_table,
        row_count: numberValue(row.upserted_count ?? row.sent_count),
        last_row_synced_at: row.last_table_sync_at,
        age_seconds: row.age_seconds,
        freshness_status: row.freshness_status ?? "empty",
      }));
  const effectiveSyncCoverageRows: AnyRow[] = syncCoverageRows.length > 0
    ? syncCoverageRows
    : dashboardMetricTrustRows.map((row) => ({
        ...row,
        row_count: numberValue(row.upserted_count ?? row.sent_count),
        last_row_synced_at: row.last_table_sync_at,
        coverage_note: row.trust_note,
      }));
  const purchasingStats = [
    { label: "בקשות פתוחות", value: rows.filter((row) => row.flow_type === "purchase_request" && numberValue(row.remaining_quantity) > 0).length },
    { label: "קבלות טובין", value: rows.filter((row) => row.flow_type === "goods_receipt").length },
    { label: "ספקים", value: new Set(rows.map((row) => row.supplier_code).filter(Boolean)).size },
  ];
  const supplierRiskRows = rows
    .filter((row) => activeTab === "suppliers" && (numberValue(row.overdue_balance) > 0 || numberValue(row.open_balance) > 0))
    .map((row) => ({
      ...row,
      severity: numberValue(row.overdue_balance) > 0 ? "high" : "medium",
      risk_reason: numberValue(row.overdue_balance) > 0 ? "יתרת ספק באיחור" : "יתרת ספק פתוחה",
      entity_label: row.supplier_name,
    }));
  const financeAgingRows = Array.isArray(financeSummary?.aging)
    ? (financeSummary.aging as AnyRow[]).map((row) => ({
        label: `${valueLabel(row.finance_direction)} ${String(row.aging_bucket ?? "")}`,
        value: numberValue(row.open_amount),
      }))
    : [];
  const deliveryStats = [
    { label: "יצא ופתוח", value: rows.filter((row) => row.delivery_state === "sent_open").length },
    { label: "חזר / התקבל", value: rows.filter((row) => row.delivery_state === "returned_or_received").length },
    { label: "לא ידוע", value: rows.filter((row) => row.delivery_state === "draft_or_unknown").length },
  ];
  const salesTopCustomers = rows
    .reduce<Map<string, number>>((map, row) => {
      const key = String(row.customer_name ?? "לא ידוע");
      map.set(key, (map.get(key) ?? 0) + numberValue(row.total_amount));
      return map;
    }, new Map<string, number>());
  const salesChartRows = Array.from(salesTopCustomers.entries())
    .map(([label, value]) => ({ label: label.slice(0, 18), value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return (
    <AdminLayout
      header={<AdminPageHeader icon={Database} title="נתוני BINA" capsules={capsules} actions={headerActions} />}
      mobileBottomBar={<MobileBottomBar capsules={capsules} />}
      aiContext={aiContext}
    >
      <div className="space-y-4 pb-mobile-nav">
        {isLoading && <Card className="p-6 text-muted-foreground" role="status">טוען נתונים מאומתים…</Card>}
        {loadError && (
          <Card className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">לא ניתן לטעון את נתוני BINA כרגע</div>
                <Button variant="outline" className="mt-2" onClick={() => void loadCurrent()}>ניסיון חוזר</Button>
                <div className="mt-1 text-amber-100/70">הנתונים לא נטענו ולכן לא מוצגות ספירות או מסקנות. ניתן לנסות שוב.</div>
              </div>
            </div>
          </Card>
        )}

        {!loadError && !isLoading && activeTab === "overview" && (
          <div className="space-y-4">
            <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-2xl">
                  <p className="text-xs font-medium text-muted-foreground">מ-BINA לרצפת הייצור</p>
                  <h2 className="mt-2 text-2xl font-semibold">מה פותחים לעבודה הבאה?</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">בחרו פק״ע שהתקבלה לאחרונה, בדקו את הפרטים ובנו את רצף התחנות לפני פתיחת העבודה.</p>
                  <p className="mt-2 text-xs text-muted-foreground">תצוגת העבודה מתחילה ב-1 בנובמבר 2024. מידע מוקדם יותר זמין בחיפוש ההיסטורי ובשאלות ל-AI.</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setActiveTab("production")}>חיפוש פק״ע</Button>
                  <Button variant="outline" onClick={() => void sendAi("הצע שלוש פקעות מהחדשות ביותר שהתקבלו ב-BINA להכנה לעבודה. רק מאז נובמבר 2024, שלא נסגרו ושטרם נפתחו בגסטליט. סדר לפי תאריך קבלה מהחדש לישן. ציין מה דורש בדיקה; אי ייבוא אינו תקלה או חוב לטיפול.")}>עזרו לי לבחור עם AI</Button>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-t border-border pt-4 text-sm">
                <span><strong className="tabular-nums">{formatNumber(overviewData?.workOrders?.receivedLast30Days)}</strong> פק״עות התקבלו ב-30 הימים האחרונים</span>
                <span><strong className="tabular-nums">{formatNumber(overviewData?.workOrders?.managed)}</strong> פק״עות מקושרות לעבודות בגסטליט מאז נובמבר 2024</span>
                <span className="text-xs text-muted-foreground">סנכרון פק״עות: <span className="inline-block">{formatDate(overviewData?.sync?.lastSyncedAt, true)}</span></span>
              </div>
            </section>
            <Card className="rounded-xl border border-border bg-card/50 p-4">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold">התקבלו לאחרונה ב-BINA</h2>
                  <p className="text-sm text-muted-foreground">עד 12 הפק״עות הפתוחות האחרונות שעדיין לא נפתחו כעבודה בגסטליט, לפי תאריך קבלה. בחרו פק״ע לבדיקת הפרטים ולהכנה.</p>
                </div>
                <Button onClick={() => void sendAi("סכם את הפקעות החדשות ביותר שהתקבלו ב-BINA מאז נובמבר 2024 ואת הבדיקות הנדרשות להכנת עבודה. אל תציג את כלל הפקעות שלא יובאו כחריגה.")} className="gap-2">
                  <Bot className="h-4 w-4" />
                  נתח עם AI
                </Button>
              </div>
              <div className="hidden md:block">
              <SimpleTable rows={rows} isLoading={isLoading} onRowClick={openOrder} columns={[
                { key: "work_order_id", label: "פק״ע", render: (row) => <Bdi>{String(row.work_order_id ?? "-")}</Bdi> },
                { key: "customer_name", label: "לקוח" },
                { key: "title", label: "תיאור העבודה", render: (row) => <span className="max-w-72 line-clamp-2" title={String(row.title ?? "")}>{String(row.title ?? "—")}</span> },
                { key: "bina_quantity", label: "כמות", render: (row) => formatNumber(row.bina_quantity) },
                { key: "received_at", label: "התקבלה", render: (row) => <span className="whitespace-nowrap">{formatDate(row.received_at)}</span> },
                { key: "due_at", label: "אספקה", render: (row) => <span className="whitespace-nowrap">{formatDate(row.due_at)}</span> },
                { key: "prepare", label: "", render: (row) => <Button variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); void openOrder(row); }} aria-label={`הכנת פק״ע ${String(row.work_order_id)}`}>הכנת עבודה</Button> },
              ]} />
              </div>
              <div className="grid gap-3 md:hidden">
                {rows.map((row) => <article key={String(row.bina_id)} className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between gap-3"><strong>פק״ע <Bdi>{String(row.work_order_id)}</Bdi></strong><span className="text-sm tabular-nums">{formatNumber(row.bina_quantity)} יח׳</span></div>
                  <p className="mt-2 text-sm font-medium">{String(row.customer_name ?? "—")}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{String(row.title ?? "—")}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-muted-foreground">התקבלה</dt><dd className="mt-1">{formatDate(row.received_at)}</dd></div><div><dt className="text-muted-foreground">אספקה</dt><dd className="mt-1">{formatDate(row.due_at)}</dd></div></dl>
                  <Button variant="outline" className="mt-4 w-full" onClick={() => void openOrder(row)}>הכנת פק״ע {String(row.work_order_id)}</Button>
                </article>)}
                {rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">אין פק״עות פתוחות חדשות להצגה כרגע.</p>}
              </div>
            </Card>
          </div>
        )}

        {!loadError && !isLoading && ["production", "purchasing", "suppliers", "finance", "sales", "deliveries"].includes(activeTab) && (
          <div className="space-y-4">
            <SearchBand value={search} onChange={setSearch} onRefresh={() => void loadCurrent()} />
            {activeTab === "production" && (
              <>
                <Card className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">חיפוש פק״עות ב-BINA</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{includeHistory ? "חיפוש היסטורי מפורש · כל השנים" : "מ-1 בנובמבר 2024 · לפי תאריך קבלה, מהחדש לישן"}. לפתיחת עבודה חדשה, בחרו מהפק״עות האחרונות בסקירה.</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={includeHistory} onCheckedChange={(checked) => setIncludeHistory(checked === true)} />
                      לכלול היסטוריה מלפני נובמבר 2024
                    </label>
                  </div>
                <SimpleTable
                  rows={rows}
                  isLoading={isLoading}
                  onRowClick={openOrder}
                  columns={[
                    { key: "work_order_id", label: "פק״ע", render: (row) => <Bdi>{String(row.work_order_id ?? "-")}</Bdi> },
                    { key: "customer_name", label: "לקוח" },
                    { key: "title", label: "כותרת" },
                    { key: "received_at", label: "התקבלה", render: (row) => formatDate(row.received_at) },
                    { key: "bina_quantity", label: "כמות", render: (row) => formatNumber(row.bina_quantity) },
                    { key: "due_at", label: "אספקה", render: (row) => formatDate(row.due_at) },
                    { key: "link_status", label: "קישור", render: (row) => <Badge className={statusVariant(String(row.link_status))}>{statusLabel(String(row.link_status))}</Badge> },
                  ]}
                />
                </Card>
              </>
            )}
            {activeTab === "purchasing" && (
              <>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  <KpiCard label="בקשות רכש" value={formatNumber(purchasingStats[0].value)} icon={ShoppingCart} tone="amber" />
                  <KpiCard label="קבלות טובין" value={formatNumber(purchasingStats[1].value)} icon={PackageCheck} tone="emerald" />
                  <KpiCard label="ספקים פעילים" value={formatNumber(purchasingStats[2].value)} icon={Building2} tone="blue" />
                  <KpiCard label="סכום פתוח" value={formatCompactMoney(rows.reduce((sum, row) => sum + (row.flow_type === "purchase_request" ? numberValue(row.total_amount) : 0), 0), "ILS")} icon={WalletCards} tone="blue" hint="מדגם מסונכרן" />
                </div>
                <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
                  <MiniChartCard title="זרימת רכש" subtitle="בקשה מול קבלת טובין">
                    <SimpleDonut data={purchasingStats} />
                  </MiniChartCard>
                  <OperationalQueue
                    title="בקשות רכש פתוחות"
                    rows={rows
                      .filter((row) => row.flow_type === "purchase_request" && numberValue(row.remaining_quantity) > 0)
                      .map((row) => ({
                        ...row,
                        entity_label: row.supplier_name ?? row.item_name ?? row.document_no,
                        risk_reason: `כמות פתוחה ${formatNumber(row.remaining_quantity)} לפריט ${String(row.item_name ?? "-")}`,
                        severity: "medium",
                      }))}
                    onAsk={(row) => void sendAi(`בדוק את שורת הרכש ${String(row.document_no ?? "")} מול ספק, פק״ע ומשלוחים. מה חסום ומה כדאי לעשות?`)}
                  />
                </div>
                <SimpleTable rows={rows} isLoading={isLoading} columns={[
                  { key: "flow_type", label: "סוג", render: (row) => valueLabel(row.flow_type) },
                  { key: "document_no", label: "מסמך", render: (row) => <Bdi>{String(row.document_no ?? "-")}</Bdi> },
                  { key: "supplier_name", label: "ספק" },
                  { key: "item_name", label: "פריט" },
                  { key: "quantity", label: "כמות", render: (row) => formatNumber(row.quantity) },
                  { key: "remaining_quantity", label: "פתוח", render: (row) => formatNumber(row.remaining_quantity) },
                  { key: "total_amount", label: "סכום", render: (row) => formatMoney(row.total_amount, row.currency ?? "ILS") },
                ]} />
              </>
            )}
            {activeTab === "suppliers" && (
              <>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  <KpiCard label="ספקים במדגם" value={formatNumber(rows.length)} icon={Building2} tone="blue" />
                  <KpiCard label="יתרה פתוחה" value={formatCompactMoney(rows.reduce((sum, row) => sum + numberValue(row.open_balance), 0), "ILS")} icon={WalletCards} tone="blue" />
                  <KpiCard label="באיחור" value={formatCompactMoney(rows.reduce((sum, row) => sum + numberValue(row.overdue_balance), 0), "ILS")} icon={AlertTriangle} tone="red" />
                  <KpiCard label="תנועות פתוחות" value={formatNumber(rows.reduce((sum, row) => sum + numberValue(row.open_items), 0))} icon={ReceiptText} tone="amber" />
                </div>
                <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
                  <OperationalQueue
                    title="ספקים לטיפול"
                    rows={supplierRiskRows}
                    onAsk={(row) => void sendAi(`סכם מצב ספק ${String(row.supplier_name ?? "")}: חובות, רכש, משלוחים ופק״עות מושפעות.`)}
                  />
                  <MiniChartCard title="חשיפה לפי ספק" subtitle="יתרה פתוחה במדגם">
                    <SimpleBarChart data={rows.map((row) => ({ label: String(row.supplier_name ?? row.supplier_code ?? "-").slice(0, 16), value: numberValue(row.open_balance) })).sort((a, b) => b.value - a.value).slice(0, 8)} labelKey="label" valueKey="value" />
                  </MiniChartCard>
                </div>
                <SimpleTable rows={rows} isLoading={isLoading} columns={[
                  { key: "supplier_code", label: "קוד", render: (row) => <Bdi>{String(row.supplier_code ?? "-")}</Bdi> },
                  { key: "supplier_name", label: "ספק" },
                  { key: "open_balance", label: "יתרה", render: (row) => formatMoney(row.open_balance, row.currency ?? "ILS") },
                  { key: "overdue_balance", label: "באיחור", render: (row) => formatMoney(row.overdue_balance, row.currency ?? "ILS") },
                  { key: "open_items", label: "תנועות פתוחות", render: (row) => formatNumber(row.open_items) },
                  { key: "oldest_due_at", label: "פירעון ישן", render: (row) => formatDate(row.oldest_due_at) },
                ]} />
              </>
            )}
            {activeTab === "finance" && (
              <>
                {financeAgingRows.length > 0 && (
                  <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
                    <MiniChartCard title="גיל חוב לפי כיוון" subtitle="מדויק/משוער מוצג בפירוט בכרטיסי הכספים">
                      <SimpleBarChart data={financeAgingRows} labelKey="label" valueKey="value" />
                    </MiniChartCard>
                    <MiniChartCard title="אמינות יתרות" subtitle="הפרדה בין יתרה מדויקת, משוערת וחסרה">
                      <MetricBreakdownBar
                        data={(Array.isArray(dashboardSummary?.financeByConfidence) ? dashboardSummary.financeByConfidence : []).map((row) => ({
                          label: `${valueLabel(row.balance_confidence)} · ${valueLabel(row.finance_direction)}`,
                          value: numberValue(row.open_amount),
                        }))}
                      />
                    </MiniChartCard>
                  </div>
                )}
                <FinanceWorkbench
                  rows={rows}
                  summary={financeSummary}
                  filter={financeFilter}
                  isLoading={isLoading}
                  onFilterChange={setFinanceFilter}
                  onRefresh={() => void loadCurrent()}
                  onRowClick={openFinanceRow}
                  onAsk={(prompt) => void sendAi(prompt)}
                />
              </>
            )}
            {activeTab === "sales" && (
              <>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  <KpiCard label="חשבוניות" value={formatNumber(rows.length)} icon={ReceiptText} tone="blue" />
                  <KpiCard label="מחזור במדגם" value={formatCompactMoney(rows.reduce((sum, row) => sum + numberValue(row.total_amount), 0), "ILS")} icon={CircleDollarSign} tone="emerald" />
                  <KpiCard label="לא מסומן כשולם" value={formatNumber(rows.filter((row) => String(row.paid_flag) !== "1").length)} icon={WalletCards} tone="amber" />
                  <KpiCard label="לקוחות" value={formatNumber(new Set(rows.map((row) => row.customer_code).filter(Boolean)).size)} icon={Building2} tone="blue" />
                </div>
                <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
                  <MiniChartCard title="לקוחות מובילים" subtitle="לפי סכום חשבוניות במדגם">
                    <SimpleBarChart data={salesChartRows} labelKey="label" valueKey="value" />
                  </MiniChartCard>
                  <OperationalQueue
                    title="חשבוניות לבדיקה"
                    rows={rows
                      .filter((row) => String(row.paid_flag) !== "1")
                      .map((row) => ({
                        ...row,
                        entity_label: row.customer_name ?? row.invoice_no,
                        risk_reason: `חשבונית ${String(row.invoice_no ?? "-")} אינה מסומנת כשולמה. בדוק גבייה, פק״ע ומשלוח.`,
                        severity: "medium",
                      }))}
                    onAsk={(row) => void sendAi(`סכם מצב לקוח ${String(row.customer_name ?? "")}: חשבוניות, גבייה, פק״עות ומשלוחים.`)}
                  />
                </div>
                <SimpleTable rows={rows} isLoading={isLoading} onRowClick={(row) => {
                  setActiveTab("finance");
                  setSearch(String(row.invoice_no ?? row.customer_name ?? ""));
                  void sendAi(`בדוק את חשבונית הלקוח ${String(row.invoice_no ?? "")}, קשר למשלוח/פק״ע, ומה מצב הגבייה המשוער`);
                }} columns={[
                  { key: "invoice_no", label: "חשבונית", render: (row) => <Bdi>{String(row.invoice_no ?? "-")}</Bdi> },
                  { key: "customer_name", label: "לקוח" },
                  { key: "salesperson", label: "מכירות" },
                  { key: "invoice_at", label: "תאריך", render: (row) => formatDate(row.invoice_at) },
                  { key: "due_at", label: "פירעון", render: (row) => formatDate(row.due_at) },
                  { key: "work_order_id", label: "פק״ע", render: (row) => <Bdi>{String(row.work_order_id ?? "-")}</Bdi> },
                  { key: "total_amount", label: "סכום", render: (row) => formatMoney(row.total_amount, "ILS") },
                  { key: "paid_flag", label: "שולם", render: (row) => <Badge className={statusVariant(String(row.paid_flag) === "1" ? "paid" : "open_inferred")}>{String(row.paid_flag) === "1" ? "שולם" : "לבדיקה"}</Badge> },
                ]} />
              </>
            )}
            {activeTab === "deliveries" && (
              <>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  <KpiCard label="משלוחים" value={formatNumber(rows.length)} icon={Ship} tone="blue" />
                  <KpiCard label="יצאו ופתוחים" value={formatNumber(deliveryStats[0].value)} icon={AlertTriangle} tone="red" />
                  <KpiCard label="חזרו/התקבלו" value={formatNumber(deliveryStats[1].value)} icon={CheckCircle2} tone="emerald" />
                  <KpiCard label="ללא סטטוס ברור" value={formatNumber(deliveryStats[2].value)} icon={FileWarning} tone="amber" />
                </div>
                <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
                  <MiniChartCard title="מצב משלוחים" subtitle="יצא, חזר, לא ידוע">
                    <SimpleDonut data={deliveryStats} />
                  </MiniChartCard>
                  <OperationalQueue
                    title="משלוחים פתוחים"
                    rows={rows
                      .filter((row) => row.delivery_state === "sent_open")
                      .map((row) => ({
                        ...row,
                        entity_label: `${String(row.delivery_no ?? "-")} · ${String(row.customer_name ?? "")}`,
                        risk_reason: "משלוח יצא ועדיין לא נסגר/חזר לפי BINA",
                        severity: "medium",
                      }))}
                    onAsk={(row) => void sendAi(`בדוק משלוח ${String(row.delivery_no ?? "")}: לקוח, פק״ע, חשבונית והשפעה תפעולית.`)}
                  />
                </div>
                <SimpleTable rows={rows} isLoading={isLoading} columns={[
                  { key: "delivery_no", label: "משלוח", render: (row) => <Bdi>{String(row.delivery_no ?? "-")}</Bdi> },
                  { key: "customer_name", label: "לקוח" },
                  { key: "sent_at", label: "יצא", render: (row) => formatDate(row.sent_at) },
                  { key: "carrier", label: "מוביל" },
                  { key: "tracking_no", label: "מעקב", render: (row) => <Bdi>{String(row.tracking_no ?? "-")}</Bdi> },
                  { key: "work_order_id", label: "פק״ע", render: (row) => <Bdi>{String(row.work_order_id ?? "-")}</Bdi> },
                  { key: "delivery_state", label: "סטטוס", render: (row) => <Badge className={statusVariant(String(row.delivery_state))}>{valueLabel(row.delivery_state)}</Badge> },
                ]} />
              </>
            )}
          </div>
        )}

        {activeTab === "ai" && (
          <Card className="mx-auto max-w-3xl space-y-5 rounded-2xl border-border p-6 lg:p-8">
            <div className="flex items-start gap-3"><span className="rounded-xl bg-primary/10 p-3 text-primary"><BrainCircuit className="h-6 w-6" /></span><div><h2 className="text-xl font-semibold">שיחה עם הנתונים שלכם</h2><p className="mt-2 text-sm leading-7 text-muted-foreground">שאלו על ייצור, רכש, ספקים, כספים ומשלוחים. העוזר נפתח לצד המסך, זוכר את השיחה ומציג מקורות ומגבלות כיסוי בכל תשובה.</p></div></div>
            <Button type="button" onClick={() => sendAi()} className="gap-2"><Sparkles className="h-4 w-4" />פתיחת העוזר</Button>
            <div className="grid gap-2 sm:grid-cols-2">{(savedQuestions.length ? savedQuestions.map((question) => question.prompt_he) : ["איזה פק״עות בסיכון לאיחור היום ולמה?", "מה מצב הרכש השבוע ומה כדאי לבדוק?", "מי הספקים עם חוב פתוח או איחורים משמעותיים?", "סכם לי דוח מנהלים יומי בעברית"]).map((prompt) => <button key={prompt} type="button" onClick={() => sendAi(prompt)} className="rounded-xl border border-border p-4 text-right text-sm leading-6 transition hover:border-primary/40 hover:bg-primary/5">{prompt}</button>)}</div>
          </Card>
        )}

        {!loadError && !isLoading && activeTab === "sync" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard label="טבלאות" value={effectiveSyncRows.length} icon={Database} />
              <KpiCard label="תקינות" value={effectiveSyncRows.filter((row) => row.freshness_status === "ok").length} icon={PackageCheck} tone="emerald" />
              <KpiCard label="מיושנות" value={effectiveSyncRows.filter((row) => row.freshness_status === "stale").length} icon={AlertTriangle} tone="amber" />
              <KpiCard label="ריקות" value={effectiveSyncRows.filter((row) => row.freshness_status === "empty").length} icon={AlertTriangle} tone="red" />
            </div>
            <DataQualityBanner dashboard={dashboardSummary} syncRows={effectiveSyncRows} />
            <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
              <Card className="rounded-xl border border-border bg-card/50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">מטריצת עדכניות וכיסוי</h3>
                    <p className="text-xs text-muted-foreground">כל עוד `is_complete_snapshot=false`, KPI מסומן כחלקי ולא כסיכום הנהלה מלא.</p>
                  </div>
                  <Database className="h-5 w-5 text-primary" />
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {effectiveSyncCoverageRows.map((row) => (
                    <div key={String(row.source_table)} className="rounded-lg border border-border bg-background/60 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Bdi>{String(row.source_table ?? "-")}</Bdi>
                        <Badge className={statusVariant(String(row.freshness_status))}>{valueLabel(row.freshness_status)}</Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <span>שורות: {formatNumber(row.row_count)}</span>
                        <span>{valueLabel(row.coverage_status ?? "partial_sample")}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{formatDate(row.last_row_synced_at, true)}</div>
                      {Boolean(row.trust_note || row.coverage_note || row.sync_scope) && (
                        <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          {valueLabel(row.sync_scope)} · {String(row.trust_note ?? row.coverage_note ?? "")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
              <OperationalQueue
                title="בעיות איכות נתונים"
                rows={syncQualityRows.map((row) => ({
                  ...row,
                  entity_label: row.source_name,
                  risk_reason: row.issue_label_he,
                  severity: row.severity,
                }))}
                emptyText="אין בעיות איכות נתונים ידועות."
                onAsk={(row) => void sendAi(`הסבר את בעיית איכות הנתונים ${String(row.issue_label_he ?? row.issue_type ?? "")} ומה ההשפעה על הדשבורד.`)}
              />
            </div>
            <Card className="rounded-xl border border-border bg-card/50 p-4">
              <h2 className="mb-3 text-base font-semibold">לוגים אחרונים</h2>
              <SimpleTable rows={syncLogs} columns={[
                { key: "synced_at", label: "זמן דיווח", render: (row) => formatDate(row.synced_at, true) },
                { key: "created_at", label: "נוצר", render: (row) => formatDate(row.created_at) },
                {
                  key: "results",
                  label: "תוצאה",
                  render: (row) => {
                    const failures = syncFailureDetails(row.results);
                    return (
                      <div className="min-w-60 space-y-1">
                        <div>{summarizeSyncResult(row.results)}</div>
                        {failures.map((failure) => (
                          <div key={failure} className="text-xs text-red-400">
                            {failure}
                          </div>
                        ))}
                      </div>
                    );
                  },
                },
              ]} />
            </Card>
          </div>
        )}

        {selectedFinance && (
          <div className="fixed inset-0 z-50 bg-background/80 p-4 backdrop-blur-sm">
            <div className="mr-auto h-full max-w-3xl overflow-auto rounded-xl border border-border bg-card p-5 shadow-xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge className={statusVariant(String(drawerFinance?.paid_status))}>{String(drawerFinance?.document_type_label ?? valueLabel(drawerFinance?.kind))}</Badge>
                    <Badge className={statusVariant(String(drawerFinance?.date_quality))}>איכות נתונים: {valueLabel(drawerFinance?.date_quality)}</Badge>
                  </div>
                  <h2 className="text-lg font-semibold">
                    מסמך <bdi dir="ltr">{String(drawerFinance?.document_no ?? "-")}</bdi>
                  </h2>
                  <p className="text-sm text-muted-foreground">{String(drawerFinance?.party_name ?? "לקוח/ספק לא ידוע")}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button onClick={() => void sendAi(`למה מסמך ${String(drawerFinance?.document_no ?? "")} של ${String(drawerFinance?.party_name ?? "")} מופיע בסיכון או דורש בדיקה?`)}>
                    למה זה בסיכון?
                  </Button>
                  <Button variant="outline" onClick={() => void sendAi(`בדוק קשר לפק״ע/משלוח/רכש עבור מסמך כספי ${String(drawerFinance?.document_no ?? "")}`)}>
                    בדוק קשרים
                  </Button>
                  <Button variant="ghost" onClick={() => {
                    setSelectedFinance(null);
                    setFinanceDetail(null);
                    setFinanceDetailError(null);
                  }}>סגור</Button>
                </div>
              </div>

              {financeDetailError && (
                <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                  לא ניתן לטעון את פירוט המסמך כרגע: {financeDetailError}
                </div>
              )}

              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {detailValue("כיוון כספי", valueLabel(drawerFinance?.finance_direction))}
                {detailValue("סוג גורם", valueLabel(drawerFinance?.party_type))}
                {detailValue("סטטוס תשלום", <Badge className={statusVariant(String(drawerFinance?.paid_status))}>{valueLabel(drawerFinance?.paid_status)}</Badge>)}
                {detailValue("סכום מסמך", formatMoney(drawerFinance?.total_amount, drawerFinance?.currency_group))}
                {detailValue("יתרה / סכום פתוח", formatMoney(drawerFinance?.open_amount, drawerFinance?.currency_group))}
                {detailValue("אמינות יתרה", valueLabel(drawerFinance?.balance_confidence))}
                {detailValue("תאריך מסמך", formatDate(drawerFinance?.document_at))}
                {detailValue("תאריך פירעון", formatDate(drawerFinance?.due_at))}
                {detailValue("גיל חוב", String(drawerFinance?.aging_bucket ?? "-"))}
                {detailValue("ימי איחור", drawerFinance?.overdue_days == null ? "לא רלוונטי" : formatNumber(drawerFinance.overdue_days))}
                {detailValue("פק״ע קשורה", drawerFinance?.related_work_order_id ? <bdi dir="ltr">{String(drawerFinance.related_work_order_id)}</bdi> : "לא נמצא")}
                {detailValue("משלוח קשור", drawerFinance?.related_delivery_no ? <bdi dir="ltr">{String(drawerFinance.related_delivery_no)}</bdi> : "לא נמצא")}
                {detailValue("סנכרון אחרון", formatDate(drawerFinance?.synced_at, true))}
                {detailValue("מקור BINA", <bdi dir="auto">{String(drawerFinance?.bina_id ?? "-")}</bdi>)}
                {detailValue("סיבה לתור עבודה", String(drawerFinance?.risk_reason ?? "-"))}
              </div>

              <Card className="mb-4 rounded-xl border border-border bg-background/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">בדיקה תפעולית</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      המסך לא כותב ל-BINA. הוא מציג את הקשרים שמצאנו כדי לעזור להבין אם החוב/חשבונית משפיעים על ייצור, רכש או משלוח.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void sendAi(`סכם מצב ${valueLabel(drawerFinance?.party_type)} ${String(drawerFinance?.party_name ?? "")} לפי כספים, רכש, משלוחים ופק״עות`)}>
                    סכם גורם
                  </Button>
                </div>
              </Card>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card className="rounded-xl border border-border bg-background/60 p-4">
                  <h3 className="mb-2 font-semibold">קשרים שנמצאו</h3>
                  <div className="space-y-2 text-sm">
                    <div>שורות חשבונית לקוח: {formatNumber(Array.isArray(financeDetail?.customerInvoiceLines) ? financeDetail.customerInvoiceLines.length : 0)}</div>
                    <div>שורות חשבונית ספק לפי ספק: {formatNumber(Array.isArray(financeDetail?.supplierInvoiceLines) ? financeDetail.supplierInvoiceLines.length : 0)}</div>
                    <div>חשבוניות מכירה קשורות: {formatNumber(Array.isArray(financeDetail?.relatedSales) ? financeDetail.relatedSales.length : 0)}</div>
                    <div>משלוחים קשורים: {formatNumber(Array.isArray(financeDetail?.relatedDeliveries) ? financeDetail.relatedDeliveries.length : 0)}</div>
                    <div>פק״עות קשורות: {formatNumber(Array.isArray(financeDetail?.relatedWorkOrders) ? financeDetail.relatedWorkOrders.length : 0)}</div>
                    <div>רכש/טובין קשורים: {formatNumber(Array.isArray(financeDetail?.relatedPurchasing) ? financeDetail.relatedPurchasing.length : 0)}</div>
                    <div>סיכום ספקים קשור: {formatNumber(Array.isArray(financeDetail?.relatedSuppliers) ? financeDetail.relatedSuppliers.length : 0)}</div>
                  </div>
                </Card>
                <Card className="rounded-xl border border-border bg-background/60 p-4">
                  <h3 className="mb-2 font-semibold">פעולות AI מומלצות</h3>
                  <div className="flex flex-col gap-2">
                    <Button variant="outline" onClick={() => void sendAi(`מצא חריגות כספיות סביב ${String(drawerFinance?.party_name ?? "")}`)}>מצא חריגות כספיות</Button>
                    <Button variant="outline" onClick={() => void sendAi(`בדוק האם מסמך ${String(drawerFinance?.document_no ?? "")} קשור לפק״ע או משלוח פתוח`)}>בדוק פק״ע/משלוח</Button>
                    <Button variant="outline" onClick={() => void sendAi(`נסח הסבר ניהולי קצר למסמך הכספי ${String(drawerFinance?.document_no ?? "")}`)}>סכם להנהלה</Button>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        )}

        {selectedOrder && (
          <div className="fixed inset-0 z-50 bg-background/80 p-4 backdrop-blur-sm">
            <div className="mr-auto h-full max-w-3xl overflow-auto rounded-xl border border-border bg-card p-5 shadow-xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge className={statusVariant(String(drawerDecision?.blocker_type ?? drawerOrder?.link_status))}>{valueLabel(drawerDecision?.blocker_type ?? drawerOrder?.link_status)}</Badge>
                    <Badge className={statusVariant(String(drawerDecision?.relationship_confidence))}>אמינות קשר: {valueLabel(drawerDecision?.relationship_confidence)}</Badge>
                  </div>
                  <h2 className="text-lg font-semibold">Control Tower · פק״ע <bdi dir="ltr">{String(drawerOrder?.work_order_id ?? selectedOrder.work_order_id ?? "")}</bdi></h2>
                  <p className="text-sm text-muted-foreground">{String(drawerOrder?.customer_name ?? selectedOrder.customer_name ?? "")}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button onClick={() => void sendAi(`פתח Control Tower לפק״ע ${String(drawerOrder?.work_order_id ?? selectedOrder.work_order_id)}: סכם חסמים, מסלול, רכש, משלוחים וכספים`)}>
                    שאל על הפק״ע הזו
                  </Button>
                  <Button variant="outline" onClick={importSelectedOrder} disabled={!binaImportEnabled || !orderDetail || !!detailError}>
                    {binaImportEnabled ? "ייבוא ל-Gestelit" : "ייבוא נעול"}
                  </Button>
                  <Button variant="ghost" onClick={() => {
                    orderRequest.current++;
                    setSelectedOrder(null);
                    setOrderDetail(null);
                    setShowImportPanel(false);
                  }}>סגור</Button>
                </div>
              </div>
              {detailError && (
                <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                  לא ניתן לטעון את פירוט הפק״ע כרגע: {detailError}
                </div>
              )}
              {!orderDetail && !detailError && <p role="status" className="p-4 text-sm text-muted-foreground">טוען את פרטי הפק״ע והקשרים…</p>}
              {orderDetail && !detailError && <>
              <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_300px]">
                <RelationshipSummary order={drawerDecision ?? drawerOrder} detail={orderDetail} />
                <Card className="rounded-xl border border-border bg-background/60 p-4">
                  <h3 className="mb-2 font-semibold">פעולה הבאה</h3>
                  <div className="text-sm text-muted-foreground">{String(drawerDecision?.next_action_reason ?? "לא ניתן לקבוע מוכנות מהנתונים הזמינים")}</div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-border bg-card/60 p-2">
                      <div className="text-muted-foreground">בעלים</div>
                      <div className="font-medium">{valueLabel(drawerDecision?.owner_role)}</div>
                    </div>
                    {drawerOrder?.gestelit_job_id ? <div className="rounded-lg border border-border bg-card/60 p-2">
                      <div className="text-muted-foreground">ציון סיכון</div>
                      <div className="font-mono font-medium tabular-nums">{formatNumber(drawerDecision?.priority_score)}</div>
                    </div> : null}
                  </div>
                </Card>
              </div>
              {showImportPanel && (
                <Card className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">ייבוא פק״ע לגסטליט</h3>
                      <p className="text-sm text-muted-foreground">
                        תחילה בודקים תצוגה מקדימה. נוצר מוצר מוגמר אחד בכמות כותרת הפק״ע, עם המסלול שתבחרו. יש לאמת קבצים וחומרים לפני יצירה. נתוני BINA נשמרים ללא שינוי.
                      </p>
                    </div>
                    {importResult && (
                      <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                        <CheckCircle2 className="ml-1 h-3.5 w-3.5" />
                        יובא
                      </Badge>
                    )}
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label>תבנית תהליך</Label>
                      <Select value={selectedPresetId} onValueChange={(value) => { setSelectedPresetId(value); setImportPreview(null); setReadinessConfirmed(false); }}>
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="בחר תבנית תהליך" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">ללא תבנית — בחירת תחנות לפי סדר העבודה</SelectItem>
                          {pipelinePresets.map((preset) => (
                            <SelectItem key={preset.id} value={preset.id}>
                              {preset.name} ({preset.steps?.length ?? 0} תחנות)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                    </div>
                    <div className={cn("space-y-2", selectedPresetId !== "none" && "opacity-50")}>
                      <Label>תחנות ידניות</Label>
                      <div className="max-h-44 overflow-auto rounded-lg border border-border bg-background p-2">
                        {availableStations.length === 0 ? (
                          <div className="py-4 text-center text-sm text-muted-foreground">אין תחנות זמינות</div>
                        ) : (
                          availableStations.map((station) => (
                            <label key={station.id} className="flex cursor-pointer items-center gap-2 rounded-md p-2 text-sm hover:bg-accent">
                              <Checkbox
                                checked={selectedStationIds.includes(station.id)}
                                disabled={selectedPresetId !== "none"}
                                onCheckedChange={() => toggleStation(station.id)}
                              />
                              <span>{selectedStationIds.includes(station.id) ? `${selectedStationIds.indexOf(station.id) + 1}. ` : ""}{station.name}</span>
                              <span className="text-xs text-muted-foreground">{station.code}</span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                  {importPreview && <div className="my-4 space-y-3 rounded-xl border p-4">
                    <h4 className="font-semibold">תצוגה מקדימה — עדיין לא נשמר</h4>
                    <p>מוצר מוגמר אחד · {formatNumber(importPreview.plannedQuantity)} יחידות בכמות BINA · {Array.isArray(importPreview.route) ? importPreview.route.length : 0} תחנות</p>
                    {Array.isArray(importPreview.route) && <ol className="list-inside list-decimal text-sm">{importPreview.route.map((step: AnyRow) => <li key={String(step.station_id)}>{availableStations.find(station => station.id === step.station_id)?.name ?? "תחנה מהתבנית"}{step.requires_first_product_approval ? " · אישור מוצר ראשון" : ""}</li>)}</ol>}
                    {Array.isArray(importPreview.blockers) && importPreview.blockers.map((text) => <p key={String(text)} className="text-destructive">{String(text)}</p>)}
                    {Array.isArray(importPreview.warnings) && importPreview.warnings.map((text) => <p key={String(text)} className="text-sm text-muted-foreground">{String(text)}</p>)}
                    <label className="flex items-start gap-2 text-sm"><Checkbox checked={readinessConfirmed} onCheckedChange={(checked) => setReadinessConfirmed(checked === true)} />אימתתי את הכמות, המוצר, סדר התחנות, הקבצים והחומרים הדרושים להתחלת העבודה.</label>
                    <Button disabled={isImporting || importPreview.canImport !== true || !readinessConfirmed} onClick={() => void confirmImport(true)}>יצירת עבודה מוכנה לעובד</Button>
                  </div>}
                  {importError && (
                    <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-sm text-red-400">
                      {importError}
                    </div>
                  )}
                  {importResult && (
                    <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2 text-sm text-emerald-400">
                      נוצרה/קושרה עבודה בגסטליט ונוצרו {formatNumber(Array.isArray(importResult.items) ? importResult.items.length : 0)} פריטי עבודה חדשים.
                    </div>
                  )}
                  <div className="mt-4 flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setShowImportPanel(false)} disabled={isImporting}>ביטול</Button>
                    <Button onClick={() => void confirmImport(false)} disabled={isImporting} className="gap-2">
                      {isImporting && <Loader2 className="h-4 w-4 animate-spin" />}
                      בדיקת תצוגה מקדימה
                    </Button>
                  </div>
                </Card>
              )}
              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {detailValue("סטטוס קישור", <Badge className={statusVariant(String(drawerOrder?.link_status))}>{statusLabel(String(drawerOrder?.link_status))}</Badge>)}
                {drawerOrder?.gestelit_job_id ? detailValue("חסם MES", <Badge className={statusVariant(String(drawerDecision?.blocker_type))}>{valueLabel(drawerDecision?.blocker_type)}</Badge>) : null}
                {detailValue("תאריך קבלה", formatDate(drawerOrder?.received_at))}
                {detailValue("תאריך אספקה", formatDate(drawerOrder?.due_at))}
                {detailValue("סנכרון אחרון", formatDate(drawerOrder?.synced_at, true))}
                {detailValue("כמות BINA", formatNumber(drawerOrder?.bina_quantity))}
                {detailValue("כמות מתוכננת בגסטליט", formatNumber(drawerOrder?.gestelit_planned_quantity))}
                {detailValue("כמות טובה שדווחה", formatNumber(drawerOrder?.gestelit_completed_good))}
                {detailValue("עבודה בגסטליט", drawerOrder?.gestelit_job_number ? String(drawerOrder.gestelit_job_number) : "עדיין לא מקושר")}
                {detailValue("שורות ייצור מ-BINA", formatNumber(drawerProductionRows.length || drawerOrder?.bina_production_row_count))}
                {detailValue("מכונות/תחנות BINA", Array.isArray(drawerRouteSummary.machineNames) && drawerRouteSummary.machineNames.length > 0 ? drawerRouteSummary.machineNames.slice(0, 5).map((name) => <Bdi key={String(name)}>{String(name)} </Bdi>) : formatNumber(drawerDecision?.route_machine_count))}
                {detailValue("רכש קשור", `${formatNumber(drawerPurchasingRows.length || drawerDecision?.purchase_request_count)} שורות`)}
                {detailValue("משלוחים קשורים", `${formatNumber(drawerDeliveryRows.length || drawerDecision?.delivery_count)} שורות`)}
                {detailValue("כספים/חשבוניות", `${formatNumber(drawerFinanceRows.length + drawerSalesRows.length || drawerDecision?.finance_document_count)} שורות`)}
                {detailValue("כותרת", String(drawerOrder?.title ?? "-"))}
              </div>
              <Card className="mb-4 rounded-xl border border-border bg-background/60 p-4">
                <h3 className="mb-2 font-semibold">בדיקת תפעול לפני ייבוא</h3>
                <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <div>קישור קיים: {drawerOrder?.gestelit_job_id ? "כן" : "לא"}</div>
                  <div>שורות מקור: {formatNumber(drawerProductionRows.length)}</div>
                  <div>פער כמות: {drawerOrder?.link_status === "quantity_mismatch" ? "כן - לבדוק לפני הפעלה ברצפה" : "לא זוהה"}</div>
                  <div>סיכון איחור: {drawerOrder?.link_status === "at_risk" ? "כן" : "לא זוהה"}</div>
                </div>
              </Card>
              <div className="mb-4 grid gap-4 xl:grid-cols-3">
                <Card className="rounded-xl border border-border bg-background/60 p-4">
                  <h3 className="mb-2 font-semibold">רכש וחומרים</h3>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div>בקשות/קבלות שנמצאו: {formatNumber(drawerPurchasingRows.length)}</div>
                    <div>כמות פתוחה: {formatNumber(drawerDecision?.open_purchase_quantity)}</div>
                    <div>סכום פתוח: {formatMoney(drawerDecision?.open_purchase_amount, "ILS")}</div>
                  </div>
                </Card>
                <Card className="rounded-xl border border-border bg-background/60 p-4">
                  <h3 className="mb-2 font-semibold">משלוחים</h3>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div>משלוחים קשורים: {formatNumber(drawerDeliveryRows.length)}</div>
                    <div>פתוחים: {formatNumber(drawerDecision?.sent_open_delivery_count)}</div>
                    <div>יציאה אחרונה: {formatDate(drawerDecision?.last_sent_at)}</div>
                  </div>
                </Card>
                <Card className="rounded-xl border border-border bg-background/60 p-4">
                  <h3 className="mb-2 font-semibold">כספים ומכירות</h3>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div>חשבוניות/מסמכים: {formatNumber(drawerFinanceRows.length + drawerSalesRows.length)}</div>
                    <div>גבייה פתוחה: {formatMoney(drawerDecision?.receivable_open, "ILS")}</div>
                    <div>מסמכים באיחור: {formatNumber(drawerDecision?.overdue_finance_count)}</div>
                  </div>
                </Card>
              </div>
              <h3 className="mb-2 font-semibold">פעולות ומרכיבי ייצור</h3>
              <p className="mb-2 text-xs text-muted-foreground">כמויות הפעולות עשויות להיות בגליונות או ביחידות אחרות. כמות המוצר המוגמר נקבעת בכותרת הפק״ע.</p>
              <SimpleTable rows={drawerProductionRows} columns={[
                { key: "source_table", label: "מקור" },
                { key: "work_line_no", label: "שורה" },
                { key: "item_name", label: "פריט" },
                { key: "planned_quantity", label: "כמות", render: (row) => formatNumber(row.planned_quantity) },
                { key: "machine_name", label: "מכונה" },
              ]} />
              </>}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};
