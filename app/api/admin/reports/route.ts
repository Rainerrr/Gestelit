import { NextResponse } from "next/server";
import { requireAdminPassword, createErrorResponse } from "@/lib/auth/permissions";
import {
  getMalfunctionReportsGroupedByStation,
  getArchivedMalfunctionReports,
  getGeneralReports,
  getScrapReportsGroupedByStation,
  getOpenMalfunctionReportsCount,
  getPendingGeneralReportsCount,
  getPendingScrapReportsCount,
} from "@/lib/data/reports";
import type { ReportType } from "@/lib/types";

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

    // Fetch by type
    if (type === "malfunction") {
      const stations = await getMalfunctionReportsGroupedByStation();
      const archived = includeArchived ? await getArchivedMalfunctionReports() : [];

      return NextResponse.json({
        stations,
        archived,
      });
    }

    if (type === "general") {
      const reports = await getGeneralReports();

      return NextResponse.json({
        reports,
      });
    }

    if (type === "scrap") {
      const stations = await getScrapReportsGroupedByStation();

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
