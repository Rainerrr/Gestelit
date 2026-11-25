"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowDown,
  CircleCheck,
  Factory,
  GitBranch,
  RefreshCw,
  Search,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import {
  useAdminSessionsSelector,
  useAdminConnectionState,
  useAdminSessionsLoading,
} from "@/contexts/AdminSessionsContext";
import type { LiveJobProgress } from "@/lib/types";
import type { StatusDictionary } from "@/lib/status";
import { buildOverview, israelDate } from "@/lib/manufacturing/overview";
import { AdminLayout } from "./admin-layout";
import { ActiveReportsWidget } from "./active-reports-widget";
import { ActiveSessionsTable } from "./active-sessions-table";

const number = (value: number) => value.toLocaleString("he-IL");
type Filter = "all" | "overdue" | "waiting" | "setup";
const ask = (prompt: string) =>
  window.dispatchEvent(
    new CustomEvent("gestelit:admin-ai-open", { detail: { prompt } }),
  );

export function ManufacturingOverview({
  dictionary,
  statusesLoading,
  statusesError,
}: {
  dictionary: StatusDictionary;
  statusesLoading: boolean;
  statusesError: string | null;
}) {
  const [data, setData] = useState<{
    jobs: LiveJobProgress[];
    fetchedAt: string;
  } | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [includeTests, setIncludeTests] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const sessionMap = useAdminSessionsSelector((state) => state.sessionsMap);
  const connection = useAdminConnectionState();
  const sessionsLoading = useAdminSessionsLoading();
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/dashboard/overview", {
        credentials: "include",
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("OVERVIEW_FAILED");
      const result = await response.json();
      if (!signal?.aborted) {
        setData(result);
        setError(false);
      }
    } catch {
      if (!signal?.aborted) setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const interval = setInterval(() => {
      if (!document.hidden) void load(controller.signal);
    }, 30000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [load]);

  const today = israelDate();
  const overview = useMemo(
    () => buildOverview(data?.jobs ?? [], today, includeTests),
    [data, today, includeTests],
  );
  const rows = overview.rows.filter((row) => {
    if (filter === "overdue" && !row.overdue) return false;
    if (filter === "waiting" && (row.activeSessionCount > 0 || row.completed))
      return false;
    if (filter === "setup" && !row.needsSetup) return false;
    return `${row.job.job_number} ${row.job.customer_name ?? ""} ${row.job.description ?? ""}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase());
  });
  const stations = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        workers: Set<string>;
        stopped: boolean;
        producing: boolean;
      }
    >();
    sessionMap.forEach((session) => {
      if (!session.stationId) return;
      const station = map.get(session.stationId) ?? {
        id: session.stationId,
        name: session.stationName,
        workers: new Set<string>(),
        stopped: false,
        producing: false,
      };
      station.workers.add(session.workerName);
      const status = session.currentStatus
        ? (dictionary.station
            .get(session.stationId)
            ?.get(session.currentStatus) ??
          dictionary.global.get(session.currentStatus))
        : null;
      station.stopped ||= status?.machine_state === "stoppage";
      station.producing ||= status?.machine_state === "production";
      map.set(session.stationId, station);
    });
    return [...map.values()].sort(
      (a, b) =>
        Number(b.stopped) - Number(a.stopped) ||
        a.name.localeCompare(b.name, "he"),
    );
  }, [sessionMap, dictionary]);
  const stopped = stations.filter((station) => station.stopped).length;
  const summary = data
    ? `${overview.rows.length} עבודות פתוחות או עם משמרת פעילה; ${overview.overdue} באיחור; ${overview.dueToday} למסירה היום; ${overview.needsSetup} להשלמת הגדרה. נתוני עבודות נמשכו ב-${data.fetchedAt}.${error ? " עדכון אחרון נכשל; הנתונים עשויים להיות ישנים." : ""} מקור: Gestelit, לא תמונת כל היסטוריית BINA.`
    : "נתוני העבודות עדיין לא זמינים.";
  const filters: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "כל העבודות", count: overview.rows.length },
    { value: "overdue", label: "באיחור", count: overview.overdue },
    { value: "waiting", label: "ללא משמרת", count: overview.waiting },
    { value: "setup", label: "להשלמת הגדרה", count: overview.needsSetup },
  ];
  return (
    <AdminLayout
      aiContext={{
        screen: "סקירת ייצור",
        activeTab: filter,
        search,
        visibleSummary: summary,
      }}
      header={
        <div className="flex items-center gap-2">
          <Factory className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">סקירת ייצור</h1>
        </div>
      }
    >
      <div className="space-y-6 pb-16">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">
              מרכז התפעול ·{" "}
              {new Date().toLocaleDateString("he-IL", {
                timeZone: "Asia/Jerusalem",
                day: "numeric",
                month: "long",
              })}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              מה קורה בייצור, ומה הצעד הבא
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              עבודות פתוחות, התקדמות בין תחנות ונושאים לטיפול.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/workflows"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border bg-card px-3 text-sm"
            >
              <GitBranch className="h-4 w-4" />
              תכנון תהליך
            </Link>
            <Link
              href="/admin/jobs"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm text-primary-foreground"
            >
              ניהול עבודות
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${connection === "connected" ? "bg-emerald-500" : "bg-amber-500"}`}
            />
            {connection === "connected"
              ? "משמרות מחוברות בזמן אמת"
              : "חיבור המשמרות מתחדש"}
            <span aria-hidden="true">·</span>עבודות מתעדכנות כל 30 שניות
          </span>
          <button
            disabled={loading}
            onClick={() => void load()}
            className="flex min-h-9 items-center gap-2 rounded-md px-2 hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            {loading ? "מעדכן…" : "רענון"}
            {data && (
              <time dateTime={data.fetchedAt}>
                {new Date(data.fetchedAt).toLocaleTimeString("he-IL", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            )}
          </button>
        </div>
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
          >
            לא הצלחנו לעדכן את העבודות.{" "}
            {data
              ? "מוצגת תמונת המצב מהעדכון האחרון."
              : "אין כרגע נתונים מאומתים להצגה."}{" "}
            <button className="underline" onClick={() => void load()}>
              ניסיון נוסף
            </button>
          </div>
        )}
        {statusesError && (
          <p role="alert" className="text-sm text-amber-700">
            הגדרות מצבי התחנות לא זמינות כרגע. בדקו את פירוט המשמרות לפני קבלת
            החלטה. <button className="underline" onClick={() => window.location.reload()}>טעינה מחדש</button>
          </p>
        )}
        <section
          aria-label="מדדי סקירת ייצור"
          className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card lg:grid-cols-4"
        >
          {[
            {
              label: "עבודות פתוחות",
              value: data ? overview.rows.length : null,
              detail: "כולל עבודות ללא משמרת",
              select: "all" as Filter,
            },
            {
              label: "עבר מועד המסירה",
              value: data ? overview.overdue : null,
              detail: data
                ? `${overview.dueToday} נוספות למסירה היום`
                : "לפי מועד המסירה שהוגדר",
              select: "overdue" as Filter,
            },
            {
              label: "ממתינות למשמרת",
              value: data ? overview.waiting : null,
              detail: "ללא עובד מחובר כעת",
              select: "waiting" as Filter,
            },
            {
              label: "הגדרה חסרה",
              value: data ? overview.needsSetup : null,
              detail: "מוצרים, כמות או מסלול",
              select: "setup" as Filter,
            },
          ].map((metric) => (
            <button
              key={metric.select}
              onClick={() => setFilter(metric.select)}
              aria-pressed={filter === metric.select}
              className={`min-w-0 border-e border-b border-border p-4 text-right transition hover:bg-muted/60 sm:p-5 ${filter === metric.select ? "bg-primary/5" : ""}`}
            >
              <p className="text-xs font-medium text-muted-foreground">
                {metric.label}
              </p>
              <p
                className={`mt-3 text-3xl font-semibold tabular-nums ${metric.select === "overdue" && metric.value ? "text-amber-700 dark:text-amber-400" : ""}`}
              >
                {metric.value === null ? "—" : number(metric.value)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {metric.detail}
              </p>
            </button>
          ))}
        </section>
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section
            className="min-w-0 overflow-hidden rounded-xl border bg-card"
            aria-labelledby="work-queue-title"
          >
            <div className="space-y-4 border-b p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="work-queue-title" className="font-semibold">
                    תור העבודה
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    איחורים קודם, אחריהם מסירות להיום והשלמת הגדרות
                  </p>
                </div>
                <span className="rounded-md bg-muted px-2 py-1 text-xs tabular-nums">
                  {rows.length} עבודות
                </span>
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={includeTests} onChange={(event) => setIncludeTests(event.target.checked)} />כולל עבודות בדיקה והדגמה</label>
              <label className="flex items-center gap-2 rounded-lg border px-3">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="חיפוש עבודה, לקוח או תיאור"
                  aria-label="חיפוש בתור העבודה"
                  className="min-h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </label>
              <div className="flex flex-wrap gap-1.5" aria-label="סינון עבודות">
                {filters.map((item) => (
                  <button
                    key={item.value}
                    aria-pressed={filter === item.value}
                    onClick={() => setFilter(item.value)}
                    className={`min-h-9 rounded-lg px-2.5 text-xs ${filter === item.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                  >
                    {item.label}{" "}
                    <span className="ms-1 tabular-nums">
                      {data ? item.count : "…"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {!data ? (
              <p
                role="status"
                className="p-8 text-center text-sm text-muted-foreground"
              >
                {error ? "נתוני העבודות אינם זמינים" : "טוען את תור העבודה…"}
              </p>
            ) : !rows.length ? (
              <div className="p-8 text-center">
                <CircleCheck className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
                <p className="text-sm">
                  {overview.rows.length
                    ? "אין עבודות שמתאימות לסינון"
                    : "אין עבודות פתוחות כרגע"}
                </p>
                {(filter !== "all" || search) && (
                  <button
                    onClick={() => {
                      setFilter("all");
                      setSearch("");
                    }}
                    className="mt-3 text-sm text-primary underline"
                  >
                    ניקוי הסינון
                  </button>
                )}
              </div>
            ) : (
              <div className="max-h-[720px] divide-y overflow-y-auto">
                {rows.map((row) => (
                  <article key={row.job.id}>
                    <button
                      onClick={() =>
                        setExpanded(expanded === row.job.id ? null : row.job.id)
                      }
                      aria-expanded={expanded === row.job.id}
                      aria-controls={`job-${row.job.id}`}
                      className="w-full space-y-3 p-4 text-right hover:bg-muted/30 sm:p-5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold">
                            {row.job.job_number}
                            <span className="mx-2 font-normal text-muted-foreground">
                              ·
                            </span>
                            {row.job.customer_name || "לקוח לא הוגדר"}
                          </p>
                          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                            {row.job.description ||
                              `${row.jobItems.length} מוצרים בעבודה`}
                          </p>
                        </div>
                        <ArrowDown
                          className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition ${expanded === row.job.id ? "rotate-180" : ""}`}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={`rounded-md px-2 py-1 ${row.overdue ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-muted text-muted-foreground"}`}
                        >
                          {row.overdue
                            ? "באיחור · "
                            : row.dueToday
                              ? "מסירה היום · "
                              : "מסירה · "}
                          {row.job.due_date
                            ? row.job.due_date
                                .slice(0, 10)
                                .split("-")
                                .reverse()
                                .join(".")
                            : "ללא תאריך"}
                        </span>
                        <span className="text-muted-foreground">
                          {row.activeSessionCount
                            ? `${row.activeSessionCount} משמרות פעילות`
                            : "ללא משמרת פעילה"}
                        </span>
                        {row.needsSetup && (
                          <span className="text-amber-700 dark:text-amber-400">
                            נדרשת הגדרה
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="mb-1.5 flex justify-between gap-3 text-xs">
                          <span className="text-muted-foreground">
                            השלמת דיווח בתחנה הסופית
                          </span>
                          <span className="tabular-nums">
                            {row.planned
                              ? `${row.percent}%`
                              : "טרם הוגדרה כמות"}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary/70"
                            style={{ width: `${row.percent}%` }}
                          />
                        </div>
                      </div>
                    </button>
                    {expanded === row.job.id && (
                      <div
                        id={`job-${row.job.id}`}
                        className="space-y-4 border-t bg-muted/25 p-4 sm:p-5"
                      >
                        <p className="text-xs leading-6 text-muted-foreground">
                          {number(row.good)} תקינים · {number(row.scrap)} פסולים
                          · {number(row.planned)} מתוכננים. אחוז ההשלמה כולל
                          פסולים, לפי כל מוצר בנפרד.
                        </p>
                        {row.jobItems.map((item) => (
                          <div
                            key={item.jobItem.id}
                            className="rounded-lg border bg-card p-3"
                          >
                            <div className="mb-3 flex flex-wrap justify-between gap-2 text-sm">
                              <h3 className="font-medium">
                                {item.jobItem.name || "מוצר ללא שם"}
                              </h3>
                              <span className="text-xs text-muted-foreground">
                                יעד {number(item.plannedQuantity)}
                              </span>
                            </div>
                            <ol className="flex flex-wrap items-stretch gap-2">
                              {[...item.wipDistribution]
                                .sort((a, b) => a.position - b.position)
                                .map((step, index) => (
                                  <li
                                    key={step.jobItemStepId}
                                    className="min-w-0 flex-1 basis-32 rounded-md border bg-muted/30 p-2.5"
                                  >
                                    <p className="text-xs font-medium">
                                      <span className="me-1.5 text-muted-foreground">
                                        {index + 1}.
                                      </span>
                                      {step.stationName}
                                    </p>
                                    <p className="mt-2 text-xs tabular-nums">
                                      {number(step.goodReported)} תקינים ·{" "}
                                      {number(step.scrapReported)} פסולים
                                    </p>
                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                      {step.isTerminal
                                        ? "תחנה סופית"
                                        : "דיווח מצטבר בתחנה"}
                                    </p>
                                  </li>
                                ))}
                            </ol>
                            {!item.wipDistribution.length && (
                              <p className="text-xs text-amber-700">
                                טרם הוגדר מסלול תחנות
                              </p>
                            )}
                          </div>
                        ))}
                        <div className="flex flex-wrap gap-3">
                          <Link
                            href={`/admin/jobs?job=${encodeURIComponent(row.job.id)}`}
                            className="text-xs font-medium text-primary underline"
                          >
                            פתיחת ניהול עבודות
                          </Link>
                          <button
                            onClick={() =>
                              ask(
                                `בדוק את עבודה ${row.job.job_number} בנתוני Gestelit: מה מצב ההתקדמות, מה חסר ומה כדאי לעשות עכשיו? ציין מקור וזמן הנתונים והפרד בין דיווחי התחנות לתוצר הסופי.`,
                              )
                            }
                            className="flex items-center gap-1 text-xs text-primary"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            בדיקה עם AI
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
          <aside className="min-w-0 space-y-4">
            <section className="rounded-xl border bg-card p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">מצב הרצפה עכשיו</h2>
                <Factory className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                תחנות עם משמרת פתוחה בלבד
              </p>
              <div className="my-4 flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums">
                  {stations.length}
                </span>
                <span className="text-xs text-muted-foreground">
                  תחנות מאוישות
                </span>
                {!statusesLoading && !statusesError && stopped > 0 && (
                  <span className="ms-auto rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-900">
                    {stopped} בעצירה
                  </span>
                )}
              </div>
              {stations.length ? (
                <ul className="space-y-3">
                  {stations.map((station) => (
                    <li
                      key={station.id}
                      className="flex items-center justify-between gap-2 border-t pt-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{station.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[...station.workers].join(", ")}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-xs ${station.stopped ? "text-amber-700" : "text-muted-foreground"}`}
                      >
                        {statusesLoading || statusesError
                          ? "מצב לא זמין"
                          : station.stopped
                            ? "עצירה"
                            : station.producing
                              ? "ייצור"
                              : "משמרת פתוחה"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-t pt-3 text-sm leading-6 text-muted-foreground">
                  {sessionsLoading
                    ? "טוען את תמונת המשמרות…"
                    : connection !== "connected"
                      ? "נתוני המשמרות עשויים להיות לא מעודכנים. החיבור מתחדש."
                      : "אין משמרות פעילות. עבודות שטרם הושלמו נשארות בתור העבודה."}
                </p>
              )}
              <a
                href="#live-sessions"
                className="mt-4 inline-flex min-h-9 items-center gap-1 text-xs text-primary"
              >
                לפירוט המשמרות
                <ArrowDown className="h-3 w-3" />
              </a>
            </section>
            <section className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
              <Sparkles className="mb-2 h-5 w-5 text-primary" />
              <h2 className="font-semibold">לתכנן את הצעד הבא</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                שאלו על עבודות, דיווחים ופערים מול BINA, עם מקורות הנתונים
                בתשובה.
              </p>
              <button
                onClick={() =>
                  ask(
                    "בדוק בנתוני Gestelit אילו עבודות פתוחות דורשות טיפול קודם: איחור, הגדרה חסרה או עצירה. ציין מקורות וזמן נתונים, והצע שלוש פעולות מעשיות בלי להסיק שחוסר משמרת הוא תקלה.",
                  )
                }
                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-primary/20 bg-card px-3 text-sm text-primary"
              >
                מה דורש טיפול קודם?
                <ArrowLeft className="h-4 w-4" />
              </button>
            </section>
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <TriangleAlert className="h-4 w-4 text-muted-foreground" />
                  דיווחים פתוחים
                </h2>
                <Link href="/admin/reports" className="text-xs text-primary">
                  לכל הדיווחים
                </Link>
              </div>
              <ActiveReportsWidget />
            </section>
          </aside>
        </div>
        <section id="live-sessions" className="scroll-mt-24">
          <ActiveSessionsTable
            dictionary={dictionary}
            isDictionaryLoading={statusesLoading}
          />
        </section>
        <p className="text-xs leading-6 text-muted-foreground">
          מקור הסקירה: עבודות ודיווחי ייצור ב-Gestelit. ההתקדמות מצטברת לאורך
          חיי העבודה ואינה תפוקה יומית.{" "}
          <Link href="/admin/bina" className="underline">
            לנתוני BINA ומצב הסנכרון
          </Link>
        </p>
      </div>
    </AdminLayout>
  );
}
