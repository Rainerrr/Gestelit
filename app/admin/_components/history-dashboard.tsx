"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AdminLayout } from "./admin-layout";
import { HistoryFilters, type HistoryFiltersState } from "./history-filters";
import {
  HistoryCharts,
  type StatusSummary,
  type ThroughputSummary,
} from "./history-charts";
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
          limit: 120,
        });
        setSessions(data);
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
    async (targetMonth: { year: number; month: number }, nextFilters: HistoryFiltersState) => {
      setIsLoadingJobs(true);
      try {
        const { throughput: items } = await fetchMonthlyJobThroughputAdminApi({
          year: targetMonth.year,
          month: targetMonth.month,
          workerId: nextFilters.workerId,
          stationId: nextFilters.stationId,
          jobNumber: nextFilters.jobNumber?.trim(),
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
    void loadMonthlyJobs(monthCursor, filters);
  }, [hasAccess, monthCursor, filters, loadMonthlyJobs]);

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
        headers: { "Content-Type": "application/json" },
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
      <Card className="flex min-h-[60vh] items-center justify-center border border-slate-200 text-slate-600">
        טוען נתוני דוחות...
      </Card>
    );
  }

  if (hasAccess === false) {
    return null;
  }

  return (
    <AdminLayout
      header={
        <div className="flex flex-col gap-3 text-right">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1 text-right">
              <p className="text-xs text-slate-500">היסטוריה ודוחות</p>
              <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
                מעקב עבודות שהושלמו
              </h1>
              <p className="text-xs text-slate-500 sm:text-sm">
                פילוח עבודות סגורות, חיפוש לפי עובד, תחנה ופק&quot;ע.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setFilters({})}
              aria-label="איפוס מסננים"
              className="w-full sm:w-auto"
              size="sm"
            >
              איפוס
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        <HistoryFilters
          workers={workers}
          stations={stations}
          jobNumbers={jobNumbers}
          value={filters}
          onChange={setFilters}
        />

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-right">
              <p className="text-sm text-slate-700">עבודות שהושלמו</p>
              {deleteError ? (
                <p className="text-sm text-rose-600">{deleteError}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                disabled={selectedIds.size === 0 || isDeleting}
                onClick={handleDeleteSelected}
                aria-label="מחיקת עבודות שנבחרו"
              >
                {isDeleting ? "מוחק..." : "מחיקת נבחרים"}
              </Button>
            </div>
          </div>

          <RecentSessionsTable
            sessions={sortedSessions}
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

        <HistoryCharts
          statusData={statusData}
          throughputData={throughputData}
          isLoading={
            isLoading ||
            isLoadingFilters ||
            isLoadingStatusEvents ||
            isLoadingJobs ||
            isStatusesLoading
          }
          monthLabel={monthLabel}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          canPrevPage={pageIndex > 0}
          canNextPage={pageIndex < totalPages - 1}
          onPrevPage={handlePrevPage}
          onNextPage={handleNextPage}
          pageLabel={pageLabel}
          dictionary={dictionary}
        />
      </div>
    </AdminLayout>
  );
};
