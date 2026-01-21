import { NextRequest, NextResponse } from "next/server";
import { getJobDeletionInfo } from "@/lib/data/jobs";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  try {
    const { id } = await context.params;
    const info = await getJobDeletionInfo(id);
    return NextResponse.json(info);
  } catch (error) {
    console.error("[admin-job-deletion-info] unexpected", error);
    return NextResponse.json({ error: "UNKNOWN_ERROR" }, { status: 500 });
  }
}
