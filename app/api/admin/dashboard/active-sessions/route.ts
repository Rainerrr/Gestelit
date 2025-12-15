import { NextResponse } from "next/server";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";
import {
  fetchActiveSessions as fetchActiveSessionsData,
} from "@/lib/data/admin-dashboard";

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);
    const sessions = await fetchActiveSessionsData();
    return NextResponse.json({ sessions });
  } catch (error) {
    return createErrorResponse(error);
  }
}

