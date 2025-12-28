import { NextResponse } from "next/server";
import { requireAdminPassword, createErrorResponse } from "@/lib/auth/permissions";
import { updateReportStatus } from "@/lib/data/reports";
import type { ReportStatus } from "@/lib/types";

const VALID_STATUSES: ReportStatus[] = ["new", "approved", "open", "known", "solved"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { id } = await params;

  const body = await request.json().catch(() => null);

  if (!body || typeof body.status !== "string") {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  if (!VALID_STATUSES.includes(body.status as ReportStatus)) {
    return NextResponse.json({ error: "INVALID_STATUS" }, { status: 400 });
  }

  try {
    const report = await updateReportStatus({
      reportId: id,
      status: body.status as ReportStatus,
      adminNotes: typeof body.adminNotes === "string" ? body.adminNotes : undefined,
      changedBy: typeof body.changedBy === "string" ? body.changedBy : undefined,
    });

    return NextResponse.json({ report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";

    // Check for state machine violation
    if (message.includes("transition")) {
      return NextResponse.json(
        { error: "INVALID_STATUS_TRANSITION", details: message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "REPORT_UPDATE_FAILED", details: message },
      { status: 500 }
    );
  }
}
