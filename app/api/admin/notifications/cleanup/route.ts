import { NextResponse } from "next/server";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";
import { cleanupOldNotifications, deleteAllNotifications } from "@/lib/data/notifications";

export async function POST(request: Request) {
  try {
    await requireAdminPassword(request);

    const body = await request.json().catch(() => ({})) as { deleteAll?: boolean };

    if (body.deleteAll) {
      await deleteAllNotifications();
    } else {
      await cleanupOldNotifications();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return createErrorResponse(error);
  }
}
