import { NextResponse } from "next/server";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";
import {
  fetchNotifications,
  createNotification,
} from "@/lib/data/notifications";

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const unreadOnly = searchParams.get("unread_only") === "true";

    const notifications = await fetchNotifications({ limit, unreadOnly });
    return NextResponse.json({ notifications });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminPassword(request);

    const body = await request.json();
    const notification = await createNotification(body);
    return NextResponse.json({ notification });
  } catch (error) {
    return createErrorResponse(error);
  }
}
