import { NextResponse } from "next/server";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";
import { checkDueJobsAndNotify } from "@/lib/data/notifications";

export async function POST(request: Request) {
  try {
    await requireAdminPassword(request);
    await checkDueJobsAndNotify();
    return NextResponse.json({ success: true });
  } catch (error) {
    return createErrorResponse(error);
  }
}
