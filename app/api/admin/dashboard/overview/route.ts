import { NextResponse } from "next/server";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";
import { fetchActiveJobsWithProgress } from "@/lib/data/admin-dashboard";

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request, { allowQueryPassword: false });
    const jobs = await fetchActiveJobsWithProgress({ includeWaiting: true });
    return NextResponse.json(
      { jobs, fetchedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return createErrorResponse(error);
  }
}
