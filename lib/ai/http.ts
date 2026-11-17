import { NextResponse } from "next/server";
import { createErrorResponse, UnauthorizedError, ForbiddenError, NotFoundError } from "@/lib/auth/permissions";

export function isAiSessionId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function aiErrorResponse(error: unknown, code: string) {
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError || error instanceof NotFoundError) {
    return createErrorResponse(error, code);
  }
  // Provider/database errors can contain private connection or request details.
  return NextResponse.json({ error: code }, { status: 500 });
}
