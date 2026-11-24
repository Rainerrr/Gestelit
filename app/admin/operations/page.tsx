"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase } from "lucide-react";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { AdminPageHeader } from "@/app/admin/_components/admin-page-header";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { useAssistantScreenContext } from "@/components/ai/use-assistant-screen-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
type Row = Record<string, string | number | boolean | null>;
type Workspace = {
  tasks: Row[];
  capabilities: Row[];
  suppliers: Row[];
  workers: { full_name: string }[];
};
type Procurement = {
  from: string;
  to: string;
  sourceRows: number;
  quarters: Row[];
  suppliers: Row[];
  forecast: Row[];
  quartersTruncated: boolean;
  forecastTruncated: boolean;
  coverage: { unknownUnitLines: number; unknownCurrencyLines: number; excludedNonFinancialLines?: number; matchedInvoiceLines?: number };
};
const states: Record<string, string> = {
  open: "פתוח",
  in_progress: "בטיפול",
  done: "הושלם",
  cancelled: "בוטל",
};
const categories: Record<string, string> = {
  management: "הנהלה",
  purchasing: "רכש",
  maintenance: "תחזוקה",
  sales: "מכירות",
};
const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm";
export default function OperationsPage() {
  useAdminGuard();
  const [tab, setTab] = useState("procurement"),
    [data, setData] = useState<Workspace>({
      tasks: [],
      capabilities: [],
      suppliers: [],
      workers: [],
    }),
    [report, setReport] = useState<Procurement | null>(null);
  const [search, setSearch] = useState(""),
    [from, setFrom] = useState(() => {
      const d = new Date();
      d.setUTCMonth(d.getUTCMonth() - 24);
      return d.toISOString().slice(0, 10);
    }),
    [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [task, setTask] = useState<Row>({
      title: "",
      owner_name: "",
      category: "management",
      status: "open",
      due_date: "",
      description: "",
    }),
    [cap, setCap] = useState<Row>({
      supplier_code: "",
      service_name: "",
      unit: "",
      unit_price: "",
      currency: "ILS",
      valid_from: new Date().toISOString().slice(0, 10),
      valid_until: "",
      notes: "",
      is_active: true,
    });
  const query = new URLSearchParams({
    view: "procurement",
    from,
    to,
    search,
  }).toString();
  useAssistantScreenContext({
    filters: { dateFrom: from, dateTo: to, search },
    selectedEntity: { section: tab },
  });
  const load = useCallback(
    async (signal: AbortSignal) => {
      setBusy(true);
      try {
        const r = await fetch(
          tab === "procurement"
            ? `/api/admin/operations?${query}`
            : "/api/admin/operations",
          { signal },
        );
        if (!r.ok) throw Error();
        const body = await r.json();
        if (!signal.aborted) {
          if (tab === "procurement") setReport(body);
          else setData(body);
        }
      } catch {
        if (!signal.aborted)
          setMessage("לא הצלחנו לטעון. בדקו את התאריכים ונסו לרענן.");
      } finally {
        if (!signal.aborted) setBusy(false);
      }
    },
    [tab, query],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void load(controller.signal), 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [load, revision]);
  async function save(kind: string, value: Row) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/admin/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...value, kind }),
      });
      if (!r.ok)
        throw Error(
          r.status === 409
            ? "הרשומה השתנתה. רעננו לפני שמירה."
            : "השמירה נכשלה. בדקו את שדות החובה.",
        );
      setMessage("נשמר בהצלחה");
      if (kind === "task")
        setTask({
          title: "",
          owner_name: "",
          category: "management",
          status: "open",
          due_date: "",
          description: "",
        });
      else
        setCap({
          supplier_code: "",
          service_name: "",
          unit: "",
          unit_price: "",
          currency: "ILS",
          valid_from: new Date().toISOString().slice(0, 10),
          valid_until: "",
          notes: "",
          is_active: true,
        });
      setRevision((n) => n + 1);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "השמירה נכשלה");
    } finally {
      setBusy(false);
    }
  }
  function taskField(key: string, label: string, type = "text") {
    return (
      <label className="text-sm" key={key}>
        {label}
        <Input
          type={type}
          value={String(task[key] ?? "")}
          onChange={(e) => setTask({ ...task, [key]: e.target.value })}
        />
      </label>
    );
  }
  function capField(key: string, label: string, type = "text") {
    return (
      <label className="text-sm" key={key}>
        {label}
        <Input
          type={type}
          value={String(cap[key] ?? "")}
          onChange={(e) => setCap({ ...cap, [key]: e.target.value })}
        />
      </label>
    );
  }
  return (
    <AdminLayout
      header={
        <AdminPageHeader
          icon={Briefcase}
          title="רכש ומשימות הנהלה"
          actions={
            <Button
              variant="outline"
              onClick={() => setRevision((n) => n + 1)}
              disabled={busy}
            >
              רענון
            </Button>
          }
        />
      }
      aiContext={{ screen: "רכש ומשימות הנהלה", activeTab: ({procurement:"ניתוח רכש",capabilities:"ספקי משנה ומחירונים",tasks:"משימות הנהלה"} as Record<string,string>)[tab], search }}
    >
      <section dir="rtl" className="min-w-0 max-w-full space-y-6">
        <div className="flex flex-wrap gap-2">
          {[
            ["procurement", "ניתוח רכש"],
            ["capabilities", "ספקי משנה ומחירונים"],
            ["tasks", "משימות הנהלה"],
          ].map(([key, label]) => (
            <Button
              key={key}
              variant={tab === key ? "default" : "outline"}
              onClick={() => {
                setTab(key);
                setMessage("");
              }}
            >
              {label}
            </Button>
          ))}
          <Button asChild variant="outline">
            <Link href="/admin/maintenance">טיפולי מכונות וקומפרסורים</Link>
          </Button>
        </div>
        {message && <p role="status">{message}</p>}
        {busy && <p role="status">טוען…</p>}
        {tab === "procurement" && (
          <>
            <Card className="grid gap-4 p-5 md:grid-cols-4">
              <label className="text-sm">
                מתאריך
                <Input
                  type="date"
                  dir="ltr"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className="text-sm">
                עד תאריך
                <Input
                  type="date"
                  dir="ltr"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              <label className="text-sm">
                פריט או ספק
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="למשל נייר, קרטון או שם ספק"
                />
              </label>
              <Button asChild variant="outline" className="self-end">
                <a href={`/api/admin/operations?${query}&export=xlsx`}>
                  ייצוא ל-Excel
                </a>
              </Button>
            </Card>
            {report && !busy && (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Metric
                    title="שורות רכש בטווח"
                    value={report.sourceRows}
                  />
                  <Metric
                    title="שורות ללא יחידת מידה"
                    value={report.coverage.unknownUnitLines}
                  />
                  <Metric
                    title="שורות ללא מטבע מוגדר"
                    value={report.coverage.unknownCurrencyLines}
                  />
                </div>
                {!!report.coverage.excludedNonFinancialLines && (
                  <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                    {report.coverage.excludedNonFinancialLines.toLocaleString("he-IL")} שורות ללא קוד פריט, כמות או ערך כספי אינן נכללות בניתוח הרכש
                    (למשל הערות והוראות בחשבונית). הן נשמרות בנתוני המקור.
                  </p>
                )}
                <div>
                  <h2 className="text-xl font-semibold">
                    מחירים לפי רבעון וספק
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    השוואה מותרת רק לאותו קוד ותיאור פריט, באותה יחידה ובאותו
                    מטבע. מחירים היסטוריים אינם הצעות מחיר תקפות. ללא יחידה או
                    מטבע מוגדר אין השוואה מאומתת. הכמויות והמחירים מוצגים כפי
                    שנרשמו ב-BINA; יחידה או מטבע חסרים אינם מושלמים בהשערה.
                  </p>
                </div>
                <DataTable
                  rows={report.quarters}
                  columns={[
                    ["quarter", "רבעון"],
                    ["supplier_name", "ספק"],
                    ["item_code", "קוד פריט"],
                    ["item_name", "פריט"],
                    ["unit", "יחידה"],
                    ["currency", "מטבע"],
                    ["quantity", "כמות נטו"],
                    ["weighted_unit_price", "מחיר משוקלל"],
                    ["min_unit_price", "מחיר מינימלי"],
                    ["max_unit_price", "מחיר מקסימלי"],
                  ]}
                />
                {report.quartersTruncated && (
                  <p>מוצגות 1,000 קבוצות בלבד. צמצמו את החיפוש להשוואה מלאה.</p>
                )}
                <h2 className="text-xl font-semibold">
                  בסיס לתכנון רכש רבעוני
                </h2>
                <p className="text-sm text-muted-foreground">
                  אומדן על בסיס ממוצע רכישות חיוביות ליום בתקופה שנבחרה כפול
                  91.3125 ימים. אינו תחזית ביקוש או המלצת הזמנה: יש לבדוק מלאי,
                  הזמנות פתוחות ועונתיות. ההחזרות מוצגות בנפרד.
                </p>
                <DataTable
                  rows={report.forecast}
                  columns={[
                    ["item_code", "קוד פריט"],
                    ["item_name", "פריט"],
                    ["unit", "יחידה"],
                    ["currency", "מטבע"],
                    ["purchased_quantity", "כמות רכישות"],
                    ["quarterly_baseline", "בסיס לרבעון"],
                    ["return_lines", "שורות החזרה"],
                    ["supplier_count", "ספקים"],
                  ]}
                />
                {report.forecastTruncated && (
                  <p>מוצגים 500 פריטים. צמצמו את החיפוש.</p>
                )}
              </>
            )}
          </>
        )}
        {tab === "tasks" && (
          <>
            <Card className="space-y-4 p-5">
              <h2 className="text-lg font-semibold">
                {task.id ? "עריכת משימה" : "משימת הנהלה חדשה"}
              </h2>
              <div className="grid gap-4 md:grid-cols-3">
                {taskField("title", "משימה")}
                {taskField("due_date", "תאריך יעד", "date")}
                <label className="text-sm">
                  אחראי
                  <Input
                    list="operations-owners"
                    value={String(task.owner_name ?? "")}
                    onChange={(e) =>
                      setTask({ ...task, owner_name: e.target.value })
                    }
                  />
                  <datalist id="operations-owners">
                    {data.workers.map((w) => (
                      <option key={w.full_name} value={w.full_name} />
                    ))}
                  </datalist>
                </label>
                <label className="text-sm">
                  תחום
                  <select
                    className={selectClass}
                    value={String(task.category)}
                    onChange={(e) =>
                      setTask({ ...task, category: e.target.value })
                    }
                  >
                    {Object.entries(categories).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  מצב
                  <select
                    className={selectClass}
                    value={String(task.status)}
                    onChange={(e) =>
                      setTask({ ...task, status: e.target.value })
                    }
                  >
                    {Object.entries(states).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                {taskField("description", "פרטים")}
              </div>
              <Button
                disabled={busy || String(task.title).trim().length < 2}
                onClick={() => void save("task", task)}
              >
                שמירת משימה
              </Button>
            </Card>
            <div className="grid gap-4 xl:grid-cols-3">
              {["open", "in_progress", "done"].map((status) => (
                <Card key={status} className="space-y-3 p-4">
                  <h2 className="font-semibold">{states[status]}</h2>
                  {data.tasks
                    .filter((t) => t.status === status)
                    .map((t) => (
                      <button
                        key={String(t.id)}
                        className="block w-full rounded-lg border p-4 text-right hover:bg-muted/40"
                        onClick={() => setTask(t)}
                      >
                        <p className="font-semibold">{t.title}</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {t.owner_name || "טרם שויך"} ·{" "}
                          {categories[String(t.category)]}
                        </p>
                        {t.due_date && (
                          <p className="mt-2 text-sm">
                            <bdi>
                              {new Date(String(t.due_date)).toLocaleDateString(
                                "he-IL",
                              )}
                            </bdi>
                          </p>
                        )}
                      </button>
                    ))}
                </Card>
              ))}
            </div>
          </>
        )}
        {tab === "capabilities" && (
          <>
            <Card className="space-y-4 p-5">
              <h2 className="text-lg font-semibold">
                {cap.id ? "עריכת יכולת ספק" : "הוספת יכולת ומחיר ספק"}
              </h2>
              <p className="text-sm text-muted-foreground">
                רשימת הספקים מגיעה מחשבוניות BINA. הזינו יכולת ומחיר מוסכמים עם
                תוקף; היסטוריית רכישה אינה מחירון מאושר.
              </p>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="text-sm">
                  ספק
                  <select
                    className={selectClass}
                    value={String(cap.supplier_code)}
                    onChange={(e) =>
                      setCap({ ...cap, supplier_code: e.target.value })
                    }
                  >
                    <option value="">בחירת ספק</option>
                    {data.suppliers.map((s) => (
                      <option
                        key={String(s.supplier_code)}
                        value={String(s.supplier_code)}
                      >
                        {s.supplier_name} · {s.supplier_code}
                      </option>
                    ))}
                  </select>
                </label>
                {capField("service_name", "יכולת / שירות")}
                {capField("unit", "יחידת תמחור")}
                {capField("unit_price", "מחיר ליחידה", "number")}
                <label className="text-sm">
                  מטבע
                  <select
                    className={selectClass}
                    value={String(cap.currency)}
                    onChange={(e) =>
                      setCap({ ...cap, currency: e.target.value })
                    }
                  >
                    {["ILS", "USD", "EUR", "GBP", "UNKNOWN"].map((c) => (
                      <option key={c} value={c}>
                        {c === "UNKNOWN" ? "לא ידוע" : c}
                      </option>
                    ))}
                  </select>
                </label>
                {capField("valid_from", "בתוקף מתאריך", "date")}
                {capField("valid_until", "בתוקף עד", "date")}
                {capField("notes", "הערות ותנאים")}
              </div>
              <Button
                disabled={
                  busy ||
                  !cap.supplier_code ||
                  String(cap.service_name).length < 2 ||
                  !cap.unit
                }
                onClick={() => void save("capability", cap)}
              >
                שמירת יכולת ספק
              </Button>
            </Card>
            <div className="grid gap-4 md:grid-cols-2">
              {data.capabilities
                .filter((c) => c.is_active)
                .map((c) => (
                  <Card key={String(c.id)} className="space-y-3 p-5">
                    <p className="font-semibold">
                      {
                        data.suppliers.find(
                          (s) => s.supplier_code === c.supplier_code,
                        )?.supplier_name
                      }{" "}
                      · {c.service_name}
                    </p>
                    <p>
                      {c.unit_price ?? "מחיר טרם הוזן"} {c.currency} / {c.unit}
                    </p>
                    <p className="text-sm">
                      תוקף: <bdi>{c.valid_from}</bdi> —{" "}
                      <bdi>{c.valid_until || "ללא תאריך סיום"}</bdi>
                      {c.valid_until &&
                        String(c.valid_until) <
                          new Date().toISOString().slice(0, 10) && (
                          <strong className="mr-2 text-amber-700">
                            פג תוקף
                          </strong>
                        )}
                    </p>
                    <p className="text-sm text-muted-foreground">{c.notes}</p>
                    <Button variant="outline" onClick={() => setCap(c)}>
                      עריכה
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void save("capability", { ...c, is_active: false })
                      }
                    >
                      העברה לארכיון
                    </Button>
                  </Card>
                ))}
            </div>
          </>
        )}
      </section>
    </AdminLayout>
  );
}
function Metric({ title, value }: { title: string; value: number }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-3 text-3xl font-semibold">
        <bdi>{value.toLocaleString("he-IL")}</bdi>
      </p>
    </Card>
  );
}
function DataTable({ rows, columns }: { rows: Row[]; columns: string[][] }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / 50));
  const current = Math.min(page, pages - 1);
  return (
    <Card className="min-w-0 max-w-full">
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full text-right text-sm">
          <thead className="sticky top-0 bg-card">
            <tr>
              {columns.map(([k, l]) => (
                <th key={k} className="whitespace-nowrap border-b p-3">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(current * 50, current * 50 + 50).map((row, i) => (
              <tr key={i} className="border-b last:border-0">
                {columns.map(([k]) => (
                  <td key={k} className="p-3">
                    {row[k] == null || row[k] === "" ? (
                      "לא ידוע"
                    ) : typeof row[k] === "number" ? (
                      <bdi>
                        {row[k].toLocaleString("he-IL", {
                          maximumFractionDigits: 2,
                        })}
                      </bdi>
                    ) : row[k] === "UNKNOWN" ? (
                      "לא ידוע"
                    ) : k === "quarter" ? (
                      <bdi className="whitespace-nowrap">
                        {new Date(String(row[k])).toLocaleDateString("he-IL")}
                      </bdi>
                    ) : (
                      String(row[k])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="p-8 text-center text-muted-foreground">
            לא נמצאו נתונים בטווח ובחיפוש שנבחרו.
          </p>
        )}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 border-t p-3">
          <Button
            variant="outline"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            הקודם
          </Button>
          <span className="text-sm">
            עמוד {current + 1} מתוך {pages}
          </span>
          <Button
            variant="outline"
            disabled={current === pages - 1}
            onClick={() => setPage(current + 1)}
          >
            הבא
          </Button>
        </div>
      )}
    </Card>
  );
}
