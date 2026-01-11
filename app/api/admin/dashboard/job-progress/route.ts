import { NextResponse } from "next/server";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";
import { fetchActiveJobsWithProgress } from "@/lib/data/admin-dashboard";

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);
    const jobs = await fetchActiveJobsWithProgress();
    return NextResponse.json({ jobs });
  } catch (error) {
    return createErrorResponse(error);
  }
}
