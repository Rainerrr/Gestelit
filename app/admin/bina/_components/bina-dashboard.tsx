"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  BrainCircuit,
  Building2,
  CheckCircle2,
  Database,
  FileSearch,
  Loader2,
  PackageCheck,
  ReceiptText,
  RefreshCcw,
  Send,
  Ship,
  ShoppingCart,
  Sparkles,
  WalletCards,
} from "lucide-react";
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
  fetchBinaOverviewApi,
  fetchBinaPurchasingApi,
  fetchBinaSavedQuestionsApi,
  fetchBinaSalesApi,
  fetchBinaSuppliersApi,
  fetchBinaSyncStatusApi,
  fetchBinaWorkOrderDetailApi,
  fetchBinaWorkOrdersApi,
  importBinaWorkOrderApi,
  sendBinaAiChatApi,
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

function formatDate(value: unknown) {
  if (!value || typeof value !== "string") return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function statusLabel(status: string | null | undefined) {
  switch (status) {
    case "linked":
      return "מקושר";
    case "not_imported":
      return "לא יובא";
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
    default:
      return String(value ?? "-");
  }
}

function statusVariant(status: string | null | undefined) {
  if (status === "linked" || status === "ok") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (status === "not_imported" || status === "stale" || status === "sent_open") return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  if (status === "quantity_mismatch" || status === "at_risk" || status === "empty") return "bg-red-500/10 text-red-400 border-red-500/20";
  return "bg-muted text-muted-foreground border-border";
}

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
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : fallbackError);
  }
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
  tone = "primary",
}: {
  label: string;
  value: string | number;
  icon: typeof BarChart3;
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
          <div className="font-mono text-2xl font-semibold tabular-nums">{value}</div>
        </div>
      </div>
    </Card>
  );
};

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

export const BinaDashboard = () => {
  const { hasAccess } = useAdminGuard();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [overview, setOverview] = useState<AnyRow | null>(null);
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [syncRows, setSyncRows] = useState<AnyRow[]>([]);
  const [syncLogs, setSyncLogs] = useState<AnyRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<AnyRow | null>(null);
  const [orderDetail, setOrderDetail] = useState<AnyRow | null>(null);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [pipelinePresets, setPipelinePresets] = useState<PipelinePresetWithSteps[]>([]);
  const [availableStations, setAvailableStations] = useState<Station[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("none");
  const [selectedStationIds, setSelectedStationIds] = useState<string[]>([]);
  const [allowQuantityFallback, setAllowQuantityFallback] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<AnyRow | null>(null);
  const [aiMessages, setAiMessages] = useState<Array<{ role: "user" | "assistant"; content: string; meta?: AnyRow }>>([]);
  const [aiInput, setAiInput] = useState("איזה פק״עות בסיכון לאיחור היום ולמה?");
  const [aiSessionId, setAiSessionId] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [savedQuestions, setSavedQuestions] = useState<Array<{ id: string; title_he: string; prompt_he: string; domain: string }>>([]);

  const capsules = useMemo(() => ({
    options: tabOptions,
    activeId: activeTab,
    onChange: (id: string) => setActiveTab(id as TabId),
  }), [activeTab]);

  const loadOverview = useCallback(async () => {
    const data = await fetchBinaOverviewApi() as { overview: AnyRow };
    setOverview(data.overview);
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
    try {
      if (activeTab === "overview") {
        await loadOverview();
        const data = await fetchBinaWorkOrdersApi({ limit: 12 }) as { rows: AnyRow[] };
        setRows(data.rows);
      } else if (activeTab === "production") {
        const data = await fetchBinaWorkOrdersApi({ search, limit: 80 }) as { rows: AnyRow[] };
        setRows(data.rows);
      } else if (activeTab === "purchasing") {
        const data = await fetchBinaPurchasingApi({ search, limit: 80 }) as { rows: AnyRow[] };
        setRows(data.rows);
      } else if (activeTab === "suppliers") {
        const data = await fetchBinaSuppliersApi({ search, limit: 80 }) as { rows: AnyRow[] };
        setRows(data.rows);
      } else if (activeTab === "finance") {
        const data = await fetchBinaFinanceApi({ search, limit: 80 }) as { rows: AnyRow[] };
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
        const data = await fetchBinaSyncStatusApi() as { tables: AnyRow[]; logs: AnyRow[] };
        setSyncRows(data.tables);
        setSyncLogs(data.logs);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "BINA_REQUEST_FAILED");
      if (activeTab !== "overview") setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, hasAccess, loadOverview, loadSavedQuestions, savedQuestions.length, search]);

  useEffect(() => {
    void loadCurrent();
  }, [loadCurrent]);

  const openOrder = async (row: AnyRow) => {
    setSelectedOrder(row);
    setShowImportPanel(false);
    setImportError(null);
    setDetailError(null);
    setImportResult(null);
    try {
      const detail = await fetchBinaWorkOrderDetailApi(String(row.bina_id)) as AnyRow;
      setOrderDetail(detail);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "BINA_WORK_ORDER_DETAIL_FAILED");
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
    setSelectedStationIds((current) =>
      current.includes(stationId)
        ? current.filter((id) => id !== stationId)
        : [...current, stationId],
    );
  };

  const confirmImport = async () => {
    if (!selectedOrder) return;
    if (selectedPresetId === "none" && selectedStationIds.length === 0) {
      setImportError("בחר preset או לפחות תחנה אחת לפני יצירת עבודה בגסטליט.");
      return;
    }

    setIsImporting(true);
    setImportError(null);
    try {
      const result = await importBinaWorkOrderApi(String(selectedOrder.bina_id), {
        pipeline_preset_id: selectedPresetId === "none" ? null : selectedPresetId,
        station_ids: selectedPresetId === "none" ? selectedStationIds : [],
        allowQuantityFallback,
      }) as AnyRow;
      setImportResult(result);
      await loadCurrent();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "IMPORT_FAILED");
    } finally {
      setIsImporting(false);
    }
  };

  const sendAi = async (prompt?: string) => {
    const message = (prompt ?? aiInput).trim();
    if (!message) return;
    setActiveTab("ai");
    setAiError(null);
    setAiMessages((current) => [...current, { role: "user", content: message }]);
    setIsAiLoading(true);
    try {
      const response = await sendBinaAiChatApi({
        message,
        sessionId: aiSessionId,
        context: { activeTab },
      }) as AnyRow;
      setAiSessionId(String(response.sessionId));
      setAiMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: String(response.answer ?? ""),
          meta: response,
        },
      ]);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI_CHAT_FAILED");
      setAiMessages((current) => [
        ...current,
        { role: "assistant", content: "לא הצלחתי להריץ את השאלה כרגע. בדוק שה-OpenAI key וה-migrations פעילים ואז נסה שוב." },
      ]);
    } finally {
      setIsAiLoading(false);
    }
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
    <Button variant="outline" onClick={() => setActiveTab("ai")} className="gap-2">
      <Sparkles className="h-4 w-4" />
      שאל את BINA
    </Button>
  );
  const drawerOrder = ((orderDetail?.order as AnyRow | undefined) ?? selectedOrder) as AnyRow | null;
  const drawerProductionRows = Array.isArray(orderDetail?.productionRows) ? orderDetail.productionRows as AnyRow[] : [];
  const aiContext = {
    screen: "נתוני BINA",
    activeTab,
    search: search || null,
    selectedEntity: drawerOrder
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
      overviewData?.workOrders ? `notImported=${String(overviewData.workOrders.notImported ?? 0)}, atRisk=${String(overviewData.workOrders.atRisk ?? 0)}` : null,
      rows.length ? `visibleRows=${rows.length}` : null,
    ].filter(Boolean).join("; "),
  };

  return (
    <AdminLayout
      header={<AdminPageHeader icon={Database} title="נתוני BINA" capsules={capsules} actions={headerActions} />}
      mobileBottomBar={<MobileBottomBar capsules={capsules} />}
      aiContext={aiContext}
    >
      <div className="space-y-4 pb-mobile-nav">
        {loadError && (
          <Card className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">לא ניתן לטעון את נתוני BINA כרגע</div>
                <div className="mt-1 text-amber-100/80">{loadError}</div>
                <div className="mt-1 text-amber-100/70">המסך נשאר זמין, אבל צריך לוודא שה-migrations והחיבור ל-Supabase פעילים בסביבה הזו.</div>
              </div>
            </div>
          </Card>
        )}

        {activeTab === "overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard label="סנכרון אחרון" value={formatDate(overviewData?.sync?.lastSyncedAt)} icon={RefreshCcw} tone="emerald" />
              <KpiCard label="פק״עות שלא יובאו" value={formatNumber(overviewData?.workOrders?.notImported)} icon={FileSearch} tone="amber" />
              <KpiCard label="פק״עות בסיכון" value={formatNumber(overviewData?.workOrders?.atRisk)} icon={AlertTriangle} tone="red" />
              <KpiCard label="יתרת ספקים פתוחה" value={formatNumber(overviewData?.suppliers?.openBalance)} icon={WalletCards} tone="blue" />
            </div>
            <Card className="rounded-xl border border-border bg-card/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold">פעולות מומלצות</h2>
                  <p className="text-sm text-muted-foreground">התחל מהפערים בין BINA לגסטליט ומהספקים עם חוב/איחור.</p>
                </div>
                <Button onClick={() => void sendAi("סכם לי את מצב הייצור, הרכש והספקים ותציע מה לבדוק עכשיו")} className="gap-2">
                  <Bot className="h-4 w-4" />
                  נתח עם AI
                </Button>
              </div>
              <SimpleTable
                rows={rows}
                isLoading={isLoading}
                onRowClick={openOrder}
                columns={[
                  { key: "work_order_id", label: "פק״ע" },
                  { key: "customer_name", label: "לקוח" },
                  { key: "due_at", label: "אספקה", render: (row) => formatDate(row.due_at) },
                  { key: "link_status", label: "סטטוס", render: (row) => <Badge className={statusVariant(String(row.link_status))}>{statusLabel(String(row.link_status))}</Badge> },
                ]}
              />
            </Card>
          </div>
        )}

        {["production", "purchasing", "suppliers", "finance", "sales", "deliveries"].includes(activeTab) && (
          <div className="space-y-4">
            <SearchBand value={search} onChange={setSearch} onRefresh={() => void loadCurrent()} />
            {activeTab === "production" && (
              <SimpleTable
                rows={rows}
                isLoading={isLoading}
                onRowClick={openOrder}
                columns={[
                  { key: "work_order_id", label: "פק״ע" },
                  { key: "customer_name", label: "לקוח" },
                  { key: "title", label: "כותרת" },
                  { key: "bina_quantity", label: "כמות", render: (row) => formatNumber(row.bina_quantity) },
                  { key: "due_at", label: "אספקה", render: (row) => formatDate(row.due_at) },
                  { key: "link_status", label: "קישור", render: (row) => <Badge className={statusVariant(String(row.link_status))}>{statusLabel(String(row.link_status))}</Badge> },
                ]}
              />
            )}
            {activeTab === "purchasing" && (
              <SimpleTable rows={rows} isLoading={isLoading} columns={[
                { key: "flow_type", label: "סוג", render: (row) => valueLabel(row.flow_type) },
                { key: "document_no", label: "מסמך" },
                { key: "supplier_name", label: "ספק" },
                { key: "item_name", label: "פריט" },
                { key: "quantity", label: "כמות", render: (row) => formatNumber(row.quantity) },
                { key: "remaining_quantity", label: "פתוח", render: (row) => formatNumber(row.remaining_quantity) },
                { key: "total_amount", label: "סכום", render: (row) => formatNumber(row.total_amount) },
              ]} />
            )}
            {activeTab === "suppliers" && (
              <SimpleTable rows={rows} isLoading={isLoading} columns={[
                { key: "supplier_code", label: "קוד" },
                { key: "supplier_name", label: "ספק" },
                { key: "open_balance", label: "יתרה", render: (row) => formatNumber(row.open_balance) },
                { key: "overdue_balance", label: "באיחור", render: (row) => formatNumber(row.overdue_balance) },
                { key: "open_items", label: "תנועות פתוחות", render: (row) => formatNumber(row.open_items) },
                { key: "oldest_due_at", label: "פירעון ישן", render: (row) => formatDate(row.oldest_due_at) },
              ]} />
            )}
            {activeTab === "finance" && (
              <SimpleTable rows={rows} isLoading={isLoading} columns={[
                { key: "kind", label: "סוג", render: (row) => valueLabel(row.kind) },
                { key: "document_no", label: "מסמך" },
                { key: "party_name", label: "לקוח/ספק" },
                { key: "document_at", label: "תאריך", render: (row) => formatDate(row.document_at) },
                { key: "due_at", label: "פירעון", render: (row) => formatDate(row.due_at) },
                { key: "total_amount", label: "סכום", render: (row) => formatNumber(row.total_amount) },
                { key: "balance", label: "יתרה", render: (row) => formatNumber(row.balance) },
              ]} />
            )}
            {activeTab === "sales" && (
              <SimpleTable rows={rows} isLoading={isLoading} columns={[
                { key: "invoice_no", label: "חשבונית" },
                { key: "customer_name", label: "לקוח" },
                { key: "salesperson", label: "מכירות" },
                { key: "invoice_at", label: "תאריך", render: (row) => formatDate(row.invoice_at) },
                { key: "due_at", label: "פירעון", render: (row) => formatDate(row.due_at) },
                { key: "work_order_id", label: "פק״ע" },
                { key: "total_amount", label: "סכום", render: (row) => formatNumber(row.total_amount) },
                { key: "paid_flag", label: "שולם", render: (row) => String(row.paid_flag ?? "-") },
              ]} />
            )}
            {activeTab === "deliveries" && (
              <SimpleTable rows={rows} isLoading={isLoading} columns={[
                { key: "delivery_no", label: "משלוח" },
                { key: "customer_name", label: "לקוח" },
                { key: "sent_at", label: "יצא", render: (row) => formatDate(row.sent_at) },
                { key: "carrier", label: "מוביל" },
                { key: "tracking_no", label: "מעקב" },
                { key: "work_order_id", label: "פק״ע" },
                { key: "delivery_state", label: "סטטוס", render: (row) => <Badge className={statusVariant(String(row.delivery_state))}>{valueLabel(row.delivery_state)}</Badge> },
              ]} />
            )}
          </div>
        )}

        {activeTab === "ai" && (
          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <Card className="rounded-xl border border-border bg-card/50 p-4">
              <h2 className="mb-3 text-base font-semibold">שאלות מהירות</h2>
              {(savedQuestions.length > 0 ? savedQuestions.map((question) => question.prompt_he) : [
                "איזה פק״עות בסיכון לאיחור היום ולמה?",
                "מה מצב הרכש השבוע ומה כדאי לבדוק?",
                "מי הספקים עם חוב פתוח או איחורים משמעותיים?",
                "איזה משלוחים יצאו ועדיין לא חזרו או נסגרו?",
                "סכם לי דוח מנהלים יומי בעברית",
              ]).map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void sendAi(prompt)}
                  className="mb-2 w-full rounded-lg border border-border bg-background/70 p-2 text-right text-sm transition hover:bg-accent"
                >
                  {prompt}
                </button>
              ))}
            </Card>
            <Card className="flex min-h-[560px] flex-col rounded-xl border border-border bg-card/50">
              <div className="border-b border-border p-4">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <BrainCircuit className="h-5 w-5 text-primary" />
                  AI / שאל את הנתונים
                </h2>
                <p className="text-sm text-muted-foreground">ה-AI קורא רק כלים מאושרים, מצטט מקורות, ותמיד מציע בדיקה הבאה.</p>
                {aiError && (
                  <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-sm text-amber-200">
                    {aiError}
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-3 overflow-auto p-4">
                {aiMessages.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
                    שאל על פק״עות, רכש, ספקים, כספים, מכירות, משלוחים או סנכרון.
                  </div>
                )}
                {aiMessages.map((message, index) => (
                  <div key={index} className={cn("rounded-xl p-3", message.role === "user" ? "mr-auto max-w-[80%] bg-primary/10" : "ml-auto max-w-[90%] bg-background")}>
                    <div className="whitespace-pre-wrap text-sm">{message.content}</div>
                    {message.meta && (
                      <div className="mt-3 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                        <div>מקורות: {Array.isArray(message.meta.sources) ? message.meta.sources.join(", ") : "-"}</div>
                        <div>עדכניות: {formatDate(message.meta.freshness)}</div>
                        {Boolean(message.meta.suggestedNextAction) && <div>המשך מומלץ: {String(message.meta.suggestedNextAction)}</div>}
                      </div>
                    )}
                  </div>
                ))}
                {isAiLoading && <div className="text-sm text-muted-foreground">מנתח נתונים...</div>}
              </div>
              <div className="flex gap-2 border-t border-border p-4">
                <Input value={aiInput} onChange={(event) => setAiInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void sendAi(); }} />
                <Button onClick={() => void sendAi()} disabled={isAiLoading} className="gap-2">
                  <Send className="h-4 w-4" />
                  שלח
                </Button>
              </div>
            </Card>
          </div>
        )}

        {activeTab === "sync" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard label="טבלאות" value={syncRows.length} icon={Database} />
              <KpiCard label="תקינות" value={syncRows.filter((row) => row.freshness_status === "ok").length} icon={PackageCheck} tone="emerald" />
              <KpiCard label="מיושנות" value={syncRows.filter((row) => row.freshness_status === "stale").length} icon={AlertTriangle} tone="amber" />
              <KpiCard label="ריקות" value={syncRows.filter((row) => row.freshness_status === "empty").length} icon={AlertTriangle} tone="red" />
            </div>
            <SimpleTable rows={syncRows} isLoading={isLoading} columns={[
              { key: "source_table", label: "טבלת מקור" },
              { key: "row_count", label: "שורות", render: (row) => formatNumber(row.row_count) },
              { key: "last_row_synced_at", label: "סנכרון אחרון", render: (row) => formatDate(row.last_row_synced_at) },
              { key: "freshness_status", label: "סטטוס", render: (row) => <Badge className={statusVariant(String(row.freshness_status))}>{valueLabel(row.freshness_status)}</Badge> },
            ]} />
            <Card className="rounded-xl border border-border bg-card/50 p-4">
              <h2 className="mb-3 text-base font-semibold">לוגים אחרונים</h2>
              <SimpleTable rows={syncLogs} columns={[
                { key: "synced_at", label: "זמן דיווח", render: (row) => formatDate(row.synced_at) },
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

        {selectedOrder && (
          <div className="fixed inset-0 z-50 bg-background/80 p-4 backdrop-blur-sm">
            <div className="mr-auto h-full max-w-3xl overflow-auto rounded-xl border border-border bg-card p-5 shadow-xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">פק״ע {String(selectedOrder.work_order_id ?? "")}</h2>
                  <p className="text-sm text-muted-foreground">{String(selectedOrder.customer_name ?? "")}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button onClick={() => void sendAi(`נתח את הפק״ע ${String(selectedOrder.work_order_id)} ותציע מה לבדוק`)}>
                    שאל על הפק״ע הזו
                  </Button>
                  <Button variant="outline" onClick={importSelectedOrder}>ייבוא ל-Gestelit</Button>
                  <Button variant="ghost" onClick={() => {
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
              {showImportPanel && (
                <Card className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">ייבוא פק״ע לגסטליט</h3>
                      <p className="text-sm text-muted-foreground">
                        פעולה זו יוצרת עבודה ופריטי עבודה חדשים בגסטליט בלבד. היא לא כותבת ל-BINA.
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
                      <Select value={selectedPresetId} onValueChange={setSelectedPresetId}>
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="בחר preset" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">ללא preset - בחירת תחנות ידנית</SelectItem>
                          {pipelinePresets.map((preset) => (
                            <SelectItem key={preset.id} value={preset.id}>
                              {preset.name} ({preset.steps?.length ?? 0} תחנות)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2 pt-2">
                        <Checkbox
                          id="allow-quantity-fallback"
                          checked={allowQuantityFallback}
                          onCheckedChange={(checked) => setAllowQuantityFallback(checked === true)}
                        />
                        <Label htmlFor="allow-quantity-fallback" className="text-sm font-normal">
                          לאפשר כמות 1 כש-BINA לא מחזירה כמות תקינה
                        </Label>
                      </div>
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
                              <span>{station.name}</span>
                              <span className="text-xs text-muted-foreground">{station.code}</span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
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
                    <Button onClick={() => void confirmImport()} disabled={isImporting} className="gap-2">
                      {isImporting && <Loader2 className="h-4 w-4 animate-spin" />}
                      אשר וייבא
                    </Button>
                  </div>
                </Card>
              )}
              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {detailValue("סטטוס קישור", <Badge className={statusVariant(String(drawerOrder?.link_status))}>{statusLabel(String(drawerOrder?.link_status))}</Badge>)}
                {detailValue("תאריך אספקה", formatDate(drawerOrder?.due_at))}
                {detailValue("סנכרון אחרון", formatDate(drawerOrder?.synced_at))}
                {detailValue("כמות BINA", formatNumber(drawerOrder?.bina_quantity))}
                {detailValue("כמות מתוכננת בגסטליט", formatNumber(drawerOrder?.gestelit_planned_quantity))}
                {detailValue("כמות טובה שדווחה", formatNumber(drawerOrder?.gestelit_completed_good))}
                {detailValue("עבודה בגסטליט", drawerOrder?.gestelit_job_number ? String(drawerOrder.gestelit_job_number) : "עדיין לא מקושר")}
                {detailValue("שורות ייצור מ-BINA", formatNumber(drawerProductionRows.length || drawerOrder?.bina_production_row_count))}
                {detailValue("כותרת", String(drawerOrder?.title ?? "-"))}
              </div>
              <Card className="mb-4 rounded-xl border border-border bg-background/60 p-4">
                <h3 className="mb-2 font-semibold">בדיקת תפעול לפני ייבוא</h3>
                <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <div>קישור קיים: {drawerOrder?.gestelit_job_id ? "כן" : "לא"}</div>
                  <div>שורות מקור: {formatNumber(drawerProductionRows.length || 1)}</div>
                  <div>פער כמות: {drawerOrder?.link_status === "quantity_mismatch" ? "כן - לבדוק לפני הפעלה ברצפה" : "לא זוהה"}</div>
                  <div>סיכון איחור: {drawerOrder?.link_status === "at_risk" ? "כן" : "לא זוהה"}</div>
                </div>
              </Card>
              <h3 className="mb-2 font-semibold">שורות ייצור</h3>
              <SimpleTable rows={drawerProductionRows} columns={[
                { key: "source_table", label: "מקור" },
                { key: "work_line_no", label: "שורה" },
                { key: "item_name", label: "פריט" },
                { key: "planned_quantity", label: "כמות", render: (row) => formatNumber(row.planned_quantity) },
                { key: "machine_name", label: "מכונה" },
              ]} />
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};
