import { NextResponse } from "next/server";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";
import {
  fetchActiveSessions,
  fetchActiveSessionsEnriched,
} from "@/lib/data/admin-dashboard";

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);

    // Use optimized RPC version by default (falls back automatically if RPC not available)
    // Pass ?legacy=true to use the original multi-query approach
    const { searchParams } = new URL(request.url);
    const useLegacy = searchParams.get("legacy") === "true";

    const sessions = useLegacy
      ? await fetchActiveSessions()
      : await fetchActiveSessionsEnriched();

    return NextResponse.json({ sessions });
  } catch (error) {
    return createErrorResponse(error);
  }
}

