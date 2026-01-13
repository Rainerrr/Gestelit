import { NextResponse } from "next/server";
import { fetchReportReasons } from "@/lib/data/report-reasons";

/**
 * Public endpoint for workers to fetch active report reasons
 * Used when creating general reports
 */
export async function GET() {
  try {
    // Only fetch active reasons for workers
    const reasons = await fetchReportReasons({ activeOnly: true });
    return NextResponse.json({ reasons });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json(
      { error: "REASONS_FETCH_FAILED", details: message },
      { status: 500 }
    );
  }
}
