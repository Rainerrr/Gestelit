import { createServiceSupabase } from "@/lib/supabase/client";
import { subDays } from "date-fns";
import type {
  Report,
  ReportStatus,
  ReportType,
  ReportWithDetails,
  Station,
  StationReason,
} from "@/lib/types";

// Query options for pagination and filtering at scale
export interface ReportQueryOptions {
  /** Maximum number of reports to fetch (default: 200) */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Only fetch reports created after this date (default: 30 days ago) */
  since?: Date;
  /** Only fetch reports created before this date */
  until?: Date;
  /** Filter by station ID */
  stationId?: string;
}

// Grouped report types for admin views
export type StationWithReports = {
  station: Station;
  reports: ReportWithDetails[];
  openCount: number;
  knownCount: number;
};

export type StationWithArchivedReports = {
  station: Station;
  reports: ReportWithDetails[];
  solvedCount: number;
};

export type StationWithScrapReports = {
  station: Station;
  reports: ReportWithDetails[];
  newCount: number;
  approvedCount: number;
};

// Create report payload
type CreateReportPayload = {
  type: ReportType;
  station_id?: string | null;
  session_id?: string | null;
  reported_by_worker_id?: string | null;
  description?: string | null;
  image_url?: string | null;
  station_reason_id?: string | null;
  report_reason_id?: string | null;
  status_event_id?: string | null;
};

export async function createReport(payload: CreateReportPayload): Promise<Report> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("reports")
    .insert({
      type: payload.type,
      station_id: payload.station_id ?? null,
      session_id: payload.session_id ?? null,
      reported_by_worker_id: payload.reported_by_worker_id ?? null,
      description: payload.description ?? null,
      image_url: payload.image_url ?? null,
      station_reason_id: payload.station_reason_id ?? null,
      report_reason_id: payload.report_reason_id ?? null,
      status_event_id: payload.status_event_id ?? null,
      // Status is set by database trigger based on type
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create report: ${error.message}`);
  }

  // If this is a scrap report, mark the session as having submitted scrap report
  if (payload.type === "scrap" && payload.session_id) {
    const { error: sessionError } = await supabase
      .from("sessions")
      .update({ scrap_report_submitted: true })
      .eq("id", payload.session_id);

    if (sessionError) {
      console.error("[reports] Failed to update session scrap_report_submitted:", sessionError.message);
    }
  }

  return data as Report;
}

// Delete a single report
export async function deleteReport(reportId: string): Promise<void> {
  const supabase = createServiceSupabase();

  const { error } = await supabase
    .from("reports")
    .delete()
    .eq("id", reportId);

  if (error) {
    throw new Error(`Failed to delete report: ${error.message}`);
  }
}

// Delete all reports of a specific type
export async function deleteReportsByType(
  type: ReportType,
  options?: { olderThanDays?: number }
): Promise<number> {
  const supabase = createServiceSupabase();

  let query = supabase
    .from("reports")
    .delete()
    .eq("type", type);

  if (options?.olderThanDays) {
    const cutoffDate = subDays(new Date(), options.olderThanDays);
    query = query.lt("created_at", cutoffDate.toISOString());
  }

  const { data, error } = await query.select("id");

  if (error) {
    throw new Error(`Failed to delete reports: ${error.message}`);
  }

  return data?.length ?? 0;
}

// Auto-cleanup old general reports (older than 30 days)
export async function cleanupOldGeneralReports(): Promise<number> {
  return deleteReportsByType("general", { olderThanDays: 30 });
}

// Update report status
export type UpdateReportStatusPayload = {
  reportId: string;
  status: ReportStatus;
  adminNotes?: string | null;
  changedBy?: string;
};

export async function updateReportStatus(
  payload: UpdateReportStatusPayload
): Promise<Report> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("reports")
    .update({
      status: payload.status,
      admin_notes: payload.adminNotes ?? null,
      status_changed_by: payload.changedBy ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payload.reportId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update report status: ${error.message}`);
  }

  return data as Report;
}

// Get malfunction reports (open/known) grouped by station
export async function getMalfunctionReportsGroupedByStation(
  options: ReportQueryOptions = {}
): Promise<StationWithReports[]> {
  const supabase = createServiceSupabase();

  const limit = options.limit ?? 200;
  const since = options.since ?? subDays(new Date(), 30);

  let query = supabase
    .from("reports")
    .select("*")
    .eq("type", "malfunction")
    .in("status", ["open", "known"])
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options.until) {
    query = query.lte("created_at", options.until.toISOString());
  }
  if (options.stationId) {
    query = query.eq("station_id", options.stationId);
  }
  if (options.offset) {
    query = query.range(options.offset, options.offset + limit - 1);
  }

  const { data: reports, error: reportsError } = await query;

  if (reportsError) {
    throw new Error(`Failed to fetch malfunction reports: ${reportsError.message}`);
  }

  if (!reports || reports.length === 0) {
    return [];
  }

  return groupReportsByStation(reports);
}

// Get archived malfunction reports (solved)
export async function getArchivedMalfunctionReports(
  options: ReportQueryOptions = {}
): Promise<StationWithArchivedReports[]> {
  const supabase = createServiceSupabase();

  const limit = options.limit ?? 200;
  const since = options.since ?? subDays(new Date(), 90); // Archived: 90 days default

  let query = supabase
    .from("reports")
    .select("*")
    .eq("type", "malfunction")
    .eq("status", "solved")
    .gte("status_changed_at", since.toISOString())
    .order("status_changed_at", { ascending: false })
    .limit(limit);

  if (options.until) {
    query = query.lte("status_changed_at", options.until.toISOString());
  }
  if (options.stationId) {
    query = query.eq("station_id", options.stationId);
  }
  if (options.offset) {
    query = query.range(options.offset, options.offset + limit - 1);
  }

  const { data: reports, error: reportsError } = await query;

  if (reportsError) {
    throw new Error(`Failed to fetch archived reports: ${reportsError.message}`);
  }

  if (!reports || reports.length === 0) {
    return [];
  }

  return groupArchivedReportsByStation(reports);
}

// Get general reports (feed view - chronological)
export async function getGeneralReports(options?: {
  status?: "new" | "approved";
  limit?: number;
  since?: Date;
  until?: Date;
  stationId?: string;
  offset?: number;
}): Promise<ReportWithDetails[]> {
  const supabase = createServiceSupabase();

  const limit = options?.limit ?? 200;
  const since = options?.since ?? subDays(new Date(), 30);

  let query = supabase
    .from("reports")
    .select("*")
    .eq("type", "general")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options?.status) {
    query = query.eq("status", options.status);
  }
  if (options?.until) {
    query = query.lte("created_at", options.until.toISOString());
  }
  if (options?.stationId) {
    query = query.eq("station_id", options.stationId);
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + limit - 1);
  }

  const { data: reports, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch general reports: ${error.message}`);
  }

  if (!reports || reports.length === 0) {
    return [];
  }

  return enrichReportsWithDetails(reports);
}

// Get scrap reports grouped by station
export async function getScrapReportsGroupedByStation(
  options: ReportQueryOptions = {}
): Promise<StationWithScrapReports[]> {
  const supabase = createServiceSupabase();

  const limit = options.limit ?? 200;
  const since = options.since ?? subDays(new Date(), 30);

  let query = supabase
    .from("reports")
    .select("*")
    .eq("type", "scrap")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options.until) {
    query = query.lte("created_at", options.until.toISOString());
  }
  if (options.stationId) {
    query = query.eq("station_id", options.stationId);
  }
  if (options.offset) {
    query = query.range(options.offset, options.offset + limit - 1);
  }

  const { data: reports, error: reportsError } = await query;

  if (reportsError) {
    throw new Error(`Failed to fetch scrap reports: ${reportsError.message}`);
  }

  if (!reports || reports.length === 0) {
    return [];
  }

  return groupScrapReportsByStation(reports);
}

// Count open malfunction reports (for notification badge)
export async function getOpenMalfunctionReportsCount(): Promise<number> {
  const supabase = createServiceSupabase();

  const { count, error } = await supabase
    .from("reports")
    .select("*", { count: "exact", head: true })
    .eq("type", "malfunction")
    .eq("status", "open");

  if (error) {
    throw new Error(`Failed to count malfunction reports: ${error.message}`);
  }

  return count ?? 0;
}

// Count pending general reports
export async function getPendingGeneralReportsCount(): Promise<number> {
  const supabase = createServiceSupabase();

  const { count, error } = await supabase
    .from("reports")
    .select("*", { count: "exact", head: true })
    .eq("type", "general")
    .eq("status", "new");

  if (error) {
    throw new Error(`Failed to count general reports: ${error.message}`);
  }

  return count ?? 0;
}

// Count pending scrap reports
export async function getPendingScrapReportsCount(): Promise<number> {
  const supabase = createServiceSupabase();

  const { count, error } = await supabase
    .from("reports")
    .select("*", { count: "exact", head: true })
    .eq("type", "scrap")
    .eq("status", "new");

  if (error) {
    throw new Error(`Failed to count scrap reports: ${error.message}`);
  }

  return count ?? 0;
}

// Helper: Get reason label from station reasons
export function getReasonLabel(
  stationReasons: StationReason[] | null | undefined,
  reasonId: string | null | undefined,
  lang: "he" | "ru" = "he"
): string {
  if (!reasonId || !stationReasons) return "";

  const reason = stationReasons.find((r) => r.id === reasonId);
  if (!reason) return reasonId;

  return lang === "ru" ? reason.label_ru : reason.label_he;
}

// Helper: Enrich reports with related data
async function enrichReportsWithDetails(
  reports: Report[]
): Promise<ReportWithDetails[]> {
  const supabase = createServiceSupabase();

  const stationIds = [...new Set(reports.map((r) => r.station_id).filter(Boolean))] as string[];
  const workerIds = [...new Set(reports.map((r) => r.reported_by_worker_id).filter(Boolean))] as string[];
  const sessionIds = [...new Set(reports.map((r) => r.session_id).filter(Boolean))] as string[];
  const reasonIds = [...new Set(reports.map((r) => r.report_reason_id).filter(Boolean))] as string[];
  const statusEventIds = [...new Set(reports.map((r) => r.status_event_id).filter(Boolean))] as string[];
  const jobItemIds = [...new Set(reports.map((r) => r.job_item_id).filter(Boolean))] as string[];

  // Fetch related data in parallel
  const [stationsResult, workersResult, sessionsResult, reasonsResult, statusEventsResult, jobItemsResult] = await Promise.all([
    stationIds.length > 0
      ? supabase.from("stations").select("id, name, code, station_type, is_active, station_reasons").in("id", stationIds)
      : { data: [], error: null },
    workerIds.length > 0
      ? supabase.from("workers").select("id, full_name, worker_code").in("id", workerIds)
      : { data: [], error: null },
    sessionIds.length > 0
      ? supabase.from("sessions").select("*").in("id", sessionIds)
      : { data: [], error: null },
    reasonIds.length > 0
      ? supabase.from("report_reasons").select("*").in("id", reasonIds)
      : { data: [], error: null },
    statusEventIds.length > 0
      ? supabase
          .from("status_events")
          .select(`
            id,
            started_at,
            ended_at,
            status_definition:status_definitions(
              id,
              label_he,
              label_ru,
              color_hex,
              machine_state
            )
          `)
          .in("id", statusEventIds)
      : { data: [], error: null },
    jobItemIds.length > 0
      ? supabase.from("job_items").select("id, name").in("id", jobItemIds)
      : { data: [], error: null },
  ]);

  const stationsMap = new Map((stationsResult.data || []).map((s) => [s.id, s]));
  const workersMap = new Map((workersResult.data || []).map((w) => [w.id, w]));
  const sessionsMap = new Map((sessionsResult.data || []).map((s) => [s.id, s]));
  const reasonsMap = new Map((reasonsResult.data || []).map((r) => [r.id, r]));
  const statusEventsMap = new Map((statusEventsResult.data || []).map((e) => [e.id, e]));
  const jobItemsMap = new Map((jobItemsResult.data || []).map((j) => [j.id, j]));

  return reports.map((report) => ({
    ...report,
    station: report.station_id ? stationsMap.get(report.station_id) ?? null : null,
    session: report.session_id ? sessionsMap.get(report.session_id) ?? null : null,
    reporter: report.reported_by_worker_id ? workersMap.get(report.reported_by_worker_id) ?? null : null,
    report_reason: report.report_reason_id ? reasonsMap.get(report.report_reason_id) ?? null : null,
    status_event: report.status_event_id ? statusEventsMap.get(report.status_event_id) ?? null : null,
    job_item: report.job_item_id ? jobItemsMap.get(report.job_item_id) ?? null : null,
  })) as ReportWithDetails[];
}

// Helper: Group malfunction reports by station
async function groupReportsByStation(
  reports: Report[]
): Promise<StationWithReports[]> {
  const enriched = await enrichReportsWithDetails(reports);

  const stationMap = new Map<string, StationWithReports>();

  for (const report of enriched) {
    const stationId = report.station_id;
    if (!stationId || !report.station) continue;

    if (!stationMap.has(stationId)) {
      stationMap.set(stationId, {
        station: report.station,
        reports: [],
        openCount: 0,
        knownCount: 0,
      });
    }

    const entry = stationMap.get(stationId)!;
    entry.reports.push(report);

    if (report.status === "open") {
      entry.openCount++;
    } else if (report.status === "known") {
      entry.knownCount++;
    }
  }

  return Array.from(stationMap.values()).sort(
    (a, b) => b.openCount + b.knownCount - (a.openCount + a.knownCount)
  );
}

// Helper: Group archived reports by station
async function groupArchivedReportsByStation(
  reports: Report[]
): Promise<StationWithArchivedReports[]> {
  const enriched = await enrichReportsWithDetails(reports);

  const stationMap = new Map<string, StationWithArchivedReports>();

  for (const report of enriched) {
    const stationId = report.station_id;
    if (!stationId || !report.station) continue;

    if (!stationMap.has(stationId)) {
      stationMap.set(stationId, {
        station: report.station,
        reports: [],
        solvedCount: 0,
      });
    }

    const entry = stationMap.get(stationId)!;
    entry.reports.push(report);
    entry.solvedCount++;
  }

  return Array.from(stationMap.values()).sort((a, b) => b.solvedCount - a.solvedCount);
}

// Helper: Group scrap reports by station
async function groupScrapReportsByStation(
  reports: Report[]
): Promise<StationWithScrapReports[]> {
  const enriched = await enrichReportsWithDetails(reports);

  const stationMap = new Map<string, StationWithScrapReports>();

  for (const report of enriched) {
    const stationId = report.station_id;
    if (!stationId || !report.station) continue;

    if (!stationMap.has(stationId)) {
      stationMap.set(stationId, {
        station: report.station,
        reports: [],
        newCount: 0,
        approvedCount: 0,
      });
    }

    const entry = stationMap.get(stationId)!;
    entry.reports.push(report);

    if (report.status === "new") {
      entry.newCount++;
    } else if (report.status === "approved") {
      entry.approvedCount++;
    }
  }

  return Array.from(stationMap.values()).sort(
    (a, b) => b.newCount - a.newCount
  );
}

// =============================================================================
// Client-side helper functions for view transformations
// =============================================================================

/**
 * Filter reports to only include ongoing ones (status event still active AND session still active)
 * A report is only "ongoing" if:
 * 1. Its status event hasn't ended (ended_at === null), AND
 * 2. Its linked session is still active (not completed/aborted)
 */
export function filterOngoingReports(
  reports: ReportWithDetails[]
): ReportWithDetails[] {
  return reports.filter((r) => {
    // Status event must be open
    const statusEventOpen = r.status_event?.ended_at === null;
    // Session must be active (if session exists)
    const sessionActive = !r.session || r.session.status === "active";
    return statusEventOpen && sessionActive;
  });
}

/**
 * Filter reports to only include finished ones (status event ended OR session completed)
 * A report is "finished" if:
 * 1. Its status event has ended (ended_at !== null), OR
 * 2. It has no status event, OR
 * 3. Its linked session is completed/aborted (even if status event wasn't properly closed)
 */
export function filterFinishedReports(
  reports: ReportWithDetails[]
): ReportWithDetails[] {
  return reports.filter((r) => {
    // If status event is closed, it's finished
    if (r.status_event?.ended_at !== null || !r.status_event) return true;
    // If session is not active, the report should be considered finished
    if (r.session && r.session.status !== "active") return true;
    return false;
  });
}

/**
 * Group reports by date (ISO date string as key)
 * Returns sorted dates (most recent first) with their reports
 */
export function groupReportsByDate(
  reports: ReportWithDetails[]
): { date: string; reports: ReportWithDetails[] }[] {
  const dateMap = new Map<string, ReportWithDetails[]>();

  for (const report of reports) {
    const dateKey = new Date(report.created_at || Date.now())
      .toISOString()
      .split("T")[0];

    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, []);
    }
    dateMap.get(dateKey)!.push(report);
  }

  // Sort dates descending (most recent first)
  const sortedDates = Array.from(dateMap.keys()).sort((a, b) =>
    b.localeCompare(a)
  );

  return sortedDates.map((date) => ({
    date,
    reports: dateMap.get(date)!,
  }));
}

/**
 * Flatten station-grouped reports into a flat array
 * Works with any station grouping type
 */
export function flattenStationReports(
  stations: (StationWithReports | StationWithArchivedReports | StationWithScrapReports)[]
): ReportWithDetails[] {
  const allReports: ReportWithDetails[] = [];

  for (const station of stations) {
    allReports.push(...station.reports);
  }

  // Sort by created_at descending
  return allReports.sort(
    (a, b) =>
      new Date(b.created_at || 0).getTime() -
      new Date(a.created_at || 0).getTime()
  );
}

/**
 * Sort malfunction reports by priority: open > known > solved
 */
export function sortByMalfunctionPriority(
  reports: ReportWithDetails[]
): ReportWithDetails[] {
  const priorityMap: Record<string, number> = {
    open: 0,
    known: 1,
    solved: 2,
  };

  return [...reports].sort((a, b) => {
    const priorityA = priorityMap[a.status] ?? 3;
    const priorityB = priorityMap[b.status] ?? 3;

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // Within same priority, sort by created_at descending
    return (
      new Date(b.created_at || 0).getTime() -
      new Date(a.created_at || 0).getTime()
    );
  });
}

/**
 * Group flat reports by station for per-station view
 * Generic version that calculates counts based on report statuses
 */
export function groupFlatReportsByStation(
  reports: ReportWithDetails[],
  reportType: ReportType
): (StationWithReports | StationWithScrapReports)[] {
  const stationMap = new Map<string, {
    station: Station;
    reports: ReportWithDetails[];
    openCount: number;
    knownCount: number;
    newCount: number;
    approvedCount: number;
  }>();

  for (const report of reports) {
    const stationId = report.station_id;
    if (!stationId || !report.station) continue;

    if (!stationMap.has(stationId)) {
      stationMap.set(stationId, {
        station: report.station,
        reports: [],
        openCount: 0,
        knownCount: 0,
        newCount: 0,
        approvedCount: 0,
      });
    }

    const entry = stationMap.get(stationId)!;
    entry.reports.push(report);

    // Count based on status
    if (report.status === "open") entry.openCount++;
    else if (report.status === "known") entry.knownCount++;
    else if (report.status === "new") entry.newCount++;
    else if (report.status === "approved") entry.approvedCount++;
  }

  const grouped = Array.from(stationMap.values());

  // Return appropriate type based on reportType
  if (reportType === "malfunction") {
    return grouped
      .map((g) => ({
        station: g.station,
        reports: g.reports,
        openCount: g.openCount,
        knownCount: g.knownCount,
      }))
      .sort((a, b) => b.openCount + b.knownCount - (a.openCount + a.knownCount));
  }

  // For general and scrap
  return grouped
    .map((g) => ({
      station: g.station,
      reports: g.reports,
      newCount: g.newCount,
      approvedCount: g.approvedCount,
    }))
    .sort((a, b) => b.newCount - a.newCount);
}
