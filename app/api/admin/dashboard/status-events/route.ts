import { NextResponse } from "next/server";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";
import {
  fetchStatusEventsBySessionIds as fetchStatusEventsData,
} from "@/lib/data/admin-dashboard";

export async function POST(request: Request) {
  try {
    await requireAdminPassword(request);

    const body = await request.json().catch(() => null);
    const sessionIds = body?.sessionIds as string[] | undefined;

    if (!sessionIds || !Array.isArray(sessionIds)) {
      return NextResponse.json(
        { error: "SESSION_IDS_REQUIRED" },
        { status: 400 },
      );
    }

    const events = await fetchStatusEventsData(sessionIds);
    return NextResponse.json({ events });
  } catch (error) {
    return createErrorResponse(error);
  }
}

