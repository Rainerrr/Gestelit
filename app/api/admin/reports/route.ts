import { NextResponse } from "next/server";
import { subDays } from "date-fns";
import { requireAdminPassword, createErrorResponse } from "@/lib/auth/permissions";
import {
  getMalfunctionReportsGroupedByStation,
  getArchivedMalfunctionReports,
  getGeneralReports,
  getScrapReportsGroupedByStation,
  getOpenMalfunctionReportsCount,
  getPendingGeneralReportsCount,
  getPendingScrapReportsCount,
  deleteReportsByType,
  cleanupOldGeneralReports,
  type ReportQueryOptions,
} from "@/lib/data/reports";
import type { ReportType } from "@/lib/types";

// Parse pagination options from search params
function parseQueryOptions(searchParams: URLSearchParams): ReportQueryOptions {
  const limit = searchParams.get("limit");
  const offset = searchParams.get("offset");
  const since = searchParams.get("since");
  const until = searchParams.get("until");
  const stationId = searchParams.get("stationId");

  return {
    limit: limit ? parseInt(limit, 10) : undefined,
    offset: offset ? parseInt(offset, 10) : undefined,
    since: since ? new Date(since) : undefined,
    until: until ? new Date(until) : undefined,
    stationId: stationId || undefined,
  };
}

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as ReportType | null;
  const includeArchived = searchParams.get("includeArchived") === "true";
  const countsOnly = searchParams.get("countsOnly") === "true";

  // Parse pagination and filter options
  const queryOptions = parseQueryOptions(searchParams);

  try {
    // Return counts only for badge/notification purposes
    if (countsOnly) {
      const [malfunctionCount, generalCount, scrapCount] = await Promise.all([
        getOpenMalfunctionReportsCount(),
        getPendingGeneralReportsCount(),
        getPendingScrapReportsCount(),
      ]);

      return NextResponse.json({
        counts: {
          malfunction: malfunctionCount,
          general: generalCount,
          scrap: scrapCount,
          total: malfunctionCount + generalCount + scrapCount,
        },
      });
    }

    // Fetch by type with pagination options
    if (type === "malfunction") {
      const stations = await getMalfunctionReportsGroupedByStation(queryOptions);
      const archived = includeArchived
        ? await getArchivedMalfunctionReports(queryOptions)
        : [];

      return NextResponse.json({
        stations,
        archived,
      });
    }

    if (type === "general") {
      const reports = await getGeneralReports(queryOptions);

      return NextResponse.json({
        reports,
      });
    }

    if (type === "scrap") {
      const stations = await getScrapReportsGroupedByStation(queryOptions);

      return NextResponse.json({
        stations,
      });
    }

    // Default: return all counts and summary
    const [malfunctionCount, generalCount, scrapCount] = await Promise.all([
      getOpenMalfunctionReportsCount(),
      getPendingGeneralReportsCount(),
      getPendingScrapReportsCount(),
    ]);

    return NextResponse.json({
      counts: {
        malfunction: malfunctionCount,
        general: generalCount,
        scrap: scrapCount,
        total: malfunctionCount + generalCount + scrapCount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json(
      { error: "REPORTS_FETCH_FAILED", details: message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as ReportType | null;
  const autoCleanup = searchParams.get("autoCleanup") === "true";

  try {
    // Auto cleanup old general reports (30 days)
    if (autoCleanup && type === "general") {
      const deletedCount = await cleanupOldGeneralReports();
      return NextResponse.json({
        success: true,
        deletedCount,
        message: `Cleaned up ${deletedCount} general reports older than 30 days`,
      });
    }

    // Delete all reports of a specific type
    if (type) {
      const deletedCount = await deleteReportsByType(type);
      return NextResponse.json({
        success: true,
        deletedCount,
        message: `Deleted ${deletedCount} ${type} reports`,
      });
    }

    return NextResponse.json(
      { error: "MISSING_TYPE", details: "Report type is required" },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json(
      { error: "REPORTS_DELETE_FAILED", details: message },
      { status: 500 }
    );
  }
}
