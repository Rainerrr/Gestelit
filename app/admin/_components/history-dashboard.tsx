"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminLayout } from "./admin-layout";
import { HistoryFilters, type HistoryFiltersState } from "./history-filters";
import {
  HistoryCharts,
  type StatusSummary,
} from "./history-charts";
import {
  ThroughputChart,
  type ThroughputSummary,
} from "./throughput-chart";
import { RecentSessionsTable } from "./recent-sessions-table";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import {
  fetchStationsAdminApi,
  fetchWorkersAdminApi,
} from "@/lib/api/admin-management";
import {
  fetchRecentSessionsAdminApi,
  fetchStatusEventsAdminApi,
  fetchMonthlyJobThroughputAdminApi,
} from "@/lib/api/admin-management";
import type {
  CompletedSession,
  JobThroughput,
  SessionStatusEvent,
} from "@/lib/data/admin-dashboard";
import {
  getStatusLabelFromDictionary,
  getStatusOrderFromDictionary,
  getStatusScopeFromDictionary,
  useStatusDictionary,
} from "./status-dictionary";

const SESSIONS_PAGE_SIZE = 50;

type Option = { id: string; label: string };

export const HistoryDashboard = () => {
  const { hasAccess } = useAdminGuard();
  const [sessions, setSessions] = useState<CompletedSession[]>([]);
  const [filters, setFilters] = useState<HistoryFiltersState>({});
  const [workers, setWorkers] = useState<Option[]>([]);
  const [stations, setStations] = useState<Option[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFilters, setIsLoadingFilters] = useState(true);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [isLoadingStatusEvents, setIsLoadingStatusEvents] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [statusEvents, setStatusEvents] = useState<SessionStatusEvent[]>([]);
  const [monthlyJobs, setMonthlyJobs] = useState<JobThroughput[]>([]);
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [pageIndex, setPageIndex] = useState(0);
  const [sort, setSort] = useState<{
    key:
      | "jobNumber"
      | "stationName"
      | "workerName"
      | "endedAt"
      | "durationSeconds"
      | "status"
      | "totalGood"
      | "totalScrap";
    direction: "asc" | "desc";
  }>({
    key: "endedAt",
    direction: "desc",
  });
  const [sessionsPageIndex, setSessionsPageIndex] = useState(0);
  const stationIds = useMemo(
    () =>
      Array.from(
        new Set(
          sessions
            .map((session) => session.stationId)
            .filter((id): id is string => Boolean(id)),
        ),
      ),
    [sessions],
  );
  const { dictionary, isLoading: isStatusesLoading } = useStatusDictionary(
    stationIds,
  );

  const loadFiltersData = useCallback(async () => {
    setIsLoadingFilters(true);
    try {
      const [{ workers: workersData }, { stations: stationsData }] =
        await Promise.all([fetchWorkersAdminApi({}), fetchStationsAdminApi()]);
      setWorkers(
        workersData
          .map((item) => ({
            id: item.worker.id,
            label: item.worker.full_name,
          }))
          .filter((item) => Boolean(item.id)),
      );
      setStations(
        stationsData
          .map((item) => ({
            id: item.station.id,
            label: item.station.name,
          }))
          .filter((item) => Boolean(item.id)),
      );
    } catch (error) {
      console.error("[history-dashboard] failed to load filters", error);
    } finally {
      setIsLoadingFilters(false);
    }
  }, []);

  const loadSessions = useCallback(
    async (nextFilters: HistoryFiltersState) => {
      setIsLoading(true);
      try {
        const { sessions: data } = await fetchRecentSessionsAdminApi({
          workerId: nextFilters.workerId,
          stationId: nextFilters.stationId,
          jobNumber: nextFilters.jobNumber?.trim(),
          limit: 500,
        });
        setSessions(data);
        setSessionsPageIndex(0);
      } catch (error) {
        console.error("[history-dashboard] failed to fetch sessions", error);
        setSessions([]);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const loadStatusEvents = useCallback(async (sessionIds: string[]) => {
    if (sessionIds.length === 0) {
      setStatusEvents([]);
      return;
    }

    setIsLoadingStatusEvents(true);
    try {
      const { events } = await fetchStatusEventsAdminApi(sessionIds);
      setStatusEvents(events);
    } catch (error) {
      console.error("[history-dashboard] failed to fetch status events", error);
      setStatusEvents([]);
    } finally {
      setIsLoadingStatusEvents(false);
    }
  }, []);

  const loadMonthlyJobs = useCallback(
    async (targetMonth: { year: number; month: number }) => {
      setIsLoadingJobs(true);
      try {
        const { throughput: items } = await fetchMonthlyJobThroughputAdminApi({
          year: targetMonth.year,
          month: targetMonth.month,
        });
        setMonthlyJobs(items);
        setPageIndex(0);
      } catch (error) {
        console.error("[history-dashboard] failed to fetch monthly jobs", error);
        setMonthlyJobs([]);
      } finally {
        setIsLoadingJobs(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (hasAccess !== true) return;
    void loadFiltersData();
  }, [hasAccess, loadFiltersData]);

  useEffect(() => {
    if (hasAccess !== true) return;
    void loadSessions(filters);
  }, [hasAccess, filters, loadSessions]);

  useEffect(() => {
    if (hasAccess !== true) return;
    const ids = sessions.map((session) => session.id);
    void loadStatusEvents(ids);
  }, [hasAccess, sessions, loadStatusEvents]);

  useEffect(() => {
    if (hasAccess !== true) return;
    void loadMonthlyJobs(monthCursor);
  }, [hasAccess, monthCursor, loadMonthlyJobs]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      sessions.forEach((session) => {
        if (prev.has(session.id)) {
          next.add(session.id);
        }
      });
      return next;
    });
  }, [dictionary, sessions, statusEvents]);

  const statusData: StatusSummary[] = useMemo(() => {
    const totals = new Map<string, StatusSummary>();
    let otherDuration = 0;

    const nowTs = Date.now();
    const sessionEndTimes = new Map<string, number>();
    sessions.forEach((session) => {
      const endedAt = session.endedAt ?? session.startedAt;
      sessionEndTimes.set(session.id, new Date(endedAt).getTime());
    });

    statusEvents.forEach((event) => {
      const startTs = new Date(event.startedAt).getTime();
      const fallbackEndTs = sessionEndTimes.get(event.sessionId) ?? nowTs;
      const explicitEndTs = event.endedAt
        ? new Date(event.endedAt).getTime()
        : fallbackEndTs;
      const endTs = Math.min(explicitEndTs, fallbackEndTs, nowTs);
      const durationMs = endTs - startTs;
      if (Number.isNaN(durationMs) || durationMs <= 0) {
        return;
      }

      const scope = getStatusScopeFromDictionary(event.status, dictionary);
      if (scope === "station" || scope === "unknown") {
        otherDuration += durationMs;
        return;
      }

      const summary =
        totals.get(event.status) ??
        (() => {
          const fallback: StatusSummary = {
            key: event.status,
            label: getStatusLabelFromDictionary(event.status, dictionary),
            value: 0,
          };
          totals.set(event.status, fallback);
          return fallback;
        })();

      summary.value += durationMs;
      totals.set(summary.key, summary);
    });

    const ordered = getStatusOrderFromDictionary(dictionary, Array.from(totals.keys()))
      .map((status) => totals.get(status))
      .filter((item): item is StatusSummary => Boolean(item));

    const orderSet = new Set(getStatusOrderFromDictionary(dictionary));
    const extras = Array.from(totals.values()).filter(
      (item) => !orderSet.has(item.key),
    );

    const combined: StatusSummary[] = [...ordered, ...extras];
    if (otherDuration > 0) {
      combined.push({
        key: "other_station_statuses",
        label: "אחר",
        value: otherDuration,
      });
    }

    return combined;
  }, [dictionary, sessions, statusEvents]);

  const monthLabel = useMemo(() => {
    const monthNames = [
      "ינואר",
      "פברואר",
      "מרץ",
      "אפריל",
      "מאי",
      "יוני",
      "יולי",
      "אוגוסט",
      "ספטמבר",
      "אוקטובר",
      "נובמבר",
      "דצמבר",
    ];
    const name = monthNames[monthCursor.month - 1] ?? "";
    return `${name} ${monthCursor.year}`;
  }, [monthCursor]);

  const totalPages = useMemo(() => {
    const pageSize = 5;
    return Math.max(1, Math.ceil(monthlyJobs.length / pageSize));
  }, [monthlyJobs.length]);

  useEffect(() => {
    const maxPage = Math.max(0, totalPages - 1);
    if (pageIndex > maxPage) {
      setPageIndex(maxPage);
    }
  }, [pageIndex, totalPages]);

  const handlePrevMonth = () => {
    setMonthCursor((prev) => {
      if (prev.month === 1) {
        return { year: prev.year - 1, month: 12 };
      }
      return { year: prev.year, month: prev.month - 1 };
    });
  };

  const handleNextMonth = () => {
    setMonthCursor((prev) => {
      if (prev.month === 12) {
        return { year: prev.year + 1, month: 1 };
      }
      return { year: prev.year, month: prev.month + 1 };
    });
  };

  const handlePrevPage = () => {
    setPageIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNextPage = () => {
    setPageIndex((prev) => Math.min(totalPages - 1, prev + 1));
  };

  const pageLabel = useMemo(
    () => `${pageIndex + 1} / ${totalPages}`,
    [pageIndex, totalPages],
  );

  const throughputData: ThroughputSummary[] = useMemo(() => {
    const pageSize = 5;
    const start = pageIndex * pageSize;
    const end = start + pageSize;
    return monthlyJobs.slice(start, end).map((job) => ({
      name: job.jobNumber,
      label: job.jobNumber,
      good: job.totalGood,
      scrap: job.totalScrap,
      planned: job.plannedQuantity ?? 0,
    }));
  }, [monthlyJobs, pageIndex]);

  const jobNumbers = useMemo(
    () => sessions.map((session) => session.jobNumber).filter(Boolean),
    [sessions],
  );

  const sortedSessions = useMemo(() => {
    const list = [...sessions];
    const direction = sort.direction === "asc" ? 1 : -1;

    const getValue = (session: CompletedSession) => {
      switch (sort.key) {
        case "jobNumber":
          return session.jobNumber ?? "";
        case "stationName":
          return session.stationName ?? "";
        case "workerName":
          return session.workerName ?? "";
        case "endedAt":
          return new Date(session.endedAt).getTime();
        case "durationSeconds":
          return session.durationSeconds ?? 0;
        case "status":
          return session.currentStatus ?? "";
        case "totalGood":
          return session.totalGood ?? 0;
        case "totalScrap":
          return session.totalScrap ?? 0;
        default:
          return "";
      }
    };

    list.sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      if (typeof va === "number" && typeof vb === "number") {
        if (va === vb) return 0;
        return va > vb ? direction : -direction;
      }
      const sa = String(va);
      const sb = String(vb);
      const cmp = sa.localeCompare(sb, "he", {
        numeric: true,
        sensitivity: "base",
      });
      return cmp * direction;
    });

    return list;
  }, [sessions, sort]);

  const sessionsTotalPages = useMemo(
    () => Math.max(1, Math.ceil(sortedSessions.length / SESSIONS_PAGE_SIZE)),
    [sortedSessions.length],
  );

  const paginatedSessions = useMemo(() => {
    const start = sessionsPageIndex * SESSIONS_PAGE_SIZE;
    return sortedSessions.slice(start, start + SESSIONS_PAGE_SIZE);
  }, [sortedSessions, sessionsPageIndex]);

  const handleSessionsPrevPage = () => {
    setSessionsPageIndex((prev) => Math.max(0, prev - 1));
  };

  const handleSessionsNextPage = () => {
    setSessionsPageIndex((prev) => Math.min(sessionsTotalPages - 1, prev + 1));
  };

  const sessionsPageLabel = useMemo(
    () => `${sessionsPageIndex + 1} / ${sessionsTotalPages}`,
    [sessionsPageIndex, sessionsTotalPages],
  );

  const handleToggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(sessions.map((s) => s.id)));
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) {
      return;
    }
    const confirmDelete =
      typeof window === "undefined"
        ? true
        : window.confirm("האם למחוק את העבודות שנבחרו?");
    if (!confirmDelete) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch("/api/admin/sessions/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Password": window.localStorage.getItem("adminPassword") || "",
        },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!response.ok) {
        throw new Error("delete_failed");
      }
      setSelectedIds(new Set());
      await loadSessions(filters);
    } catch (error) {
      console.error("[history-dashboard] delete failed", error);
      setDeleteError("מחיקה נכשלה, נסה שוב.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSort = (
    key:
      | "jobNumber"
      | "stationName"
      | "workerName"
      | "endedAt"
      | "durationSeconds"
      | "status"
      | "totalGood"
      | "totalScrap",
  ) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  };

  if (hasAccess === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        טוען נתוני דוחות...
      </div>
    );
  }

  if (hasAccess === false) {
    return null;
  }

  return (
    <AdminLayout
      header={
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <History className="h-5 w-5 text-primary shrink-0" />
            <h1 className="text-lg font-semibold text-foreground sm:text-xl">היסטוריה</h1>
          </div>
          <Button
            variant="outline"
            onClick={() => setFilters({})}
            aria-label="איפוס מסננים"
            className="border-input bg-secondary text-foreground/80 hover:bg-accent hover:text-foreground"
            size="sm"
          >
            איפוס
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Throughput chart - above filters, independent of filtering */}
        <ThroughputChart
          throughputData={throughputData}
          isLoading={isLoadingJobs}
          monthLabel={monthLabel}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          canPrevPage={pageIndex > 0}
          canNextPage={pageIndex < totalPages - 1}
          onPrevPage={handlePrevPage}
          onNextPage={handleNextPage}
          pageLabel={pageLabel}
        />

        <HistoryFilters
          workers={workers}
          stations={stations}
          jobNumbers={jobNumbers}
          value={filters}
          onChange={setFilters}
        />

        {/* Status distribution chart - affected by filters */}
        <HistoryCharts
          statusData={statusData}
          isLoading={
            isLoading ||
            isLoadingFilters ||
            isLoadingStatusEvents ||
            isStatusesLoading
          }
          dictionary={dictionary}
        />

        {/* Sessions table section */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-right">
              <p className="text-sm text-foreground/80">עבודות שהושלמו</p>
              <p className="text-xs text-muted-foreground">{sessions.length} עבודות</p>
              {deleteError ? (
                <p className="text-sm text-red-400">{deleteError}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              {/* Pagination controls */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSessionsPrevPage}
                  disabled={sessionsPageIndex === 0}
                  className="border-input bg-secondary text-foreground/80 hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  הקודם
                </Button>
                <span className="text-sm text-muted-foreground min-w-[60px] text-center">
                  {sessionsPageLabel}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSessionsNextPage}
                  disabled={sessionsPageIndex >= sessionsTotalPages - 1}
                  className="border-input bg-secondary text-foreground/80 hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  הבא
                </Button>
              </div>
              <Button
                variant="destructive"
                size="sm"
                disabled={selectedIds.size === 0 || isDeleting}
                onClick={handleDeleteSelected}
                aria-label="מחיקת עבודות שנבחרו"
                className="bg-red-600 hover:bg-red-700"
              >
                {isDeleting ? "מוחק..." : `מחיקת נבחרים (${selectedIds.size})`}
              </Button>
            </div>
          </div>

          <RecentSessionsTable
            sessions={paginatedSessions}
            isLoading={isLoading || isStatusesLoading}
            selectedIds={selectedIds}
            onToggleRow={handleToggleRow}
            onToggleAll={handleToggleAll}
            sortKey={sort.key}
            sortDirection={sort.direction}
            onSort={handleSort}
            dictionary={dictionary}
          />
        </div>
      </div>
    </AdminLayout>
  );
};
