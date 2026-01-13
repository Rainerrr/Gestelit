import { NextResponse } from "next/server";
import { checkFirstProductQAApproval } from "@/lib/data/first-product-qa";
import { createErrorResponse } from "@/lib/auth/permissions";

/**
 * First Product QA Check Endpoint
 *
 * GET /api/first-product-qa/check?jobItemId=xxx&stationId=yyy
 *
 * Returns the QA approval status for a job item at a station.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobItemId = searchParams.get("jobItemId");
  const stationId = searchParams.get("stationId");

  if (!jobItemId || !stationId) {
    return NextResponse.json(
      { error: "MISSING_PARAMS", message: "jobItemId and stationId are required" },
      { status: 400 }
    );
  }

  try {
    const status = await checkFirstProductQAApproval(jobItemId, stationId);

    return NextResponse.json({
      approved: status.approved,
      pendingReport: status.pendingReport,
      approvedReport: status.approvedReport,
    });
  } catch (error) {
    return createErrorResponse(error, "QA_CHECK_FAILED");
  }
}
