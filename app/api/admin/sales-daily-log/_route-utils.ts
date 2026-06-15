import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  createErrorResponse,
  ForbiddenError,
  generateSecureToken,
  NotFoundError,
  requireAdminPassword,
  UnauthorizedError,
} from "@/lib/auth/permissions";
import { SalesValidationError } from "@/lib/data/sales-log-utils";

export async function requireSalesAdmin(request: Request) {
  return requireAdminPassword(request, { allowQueryPassword: false });
}

export function salesRouteError(error: unknown, fallback = "SALES_REQUEST_FAILED") {
  if (
    error instanceof UnauthorizedError
    || error instanceof ForbiddenError
    || error instanceof NotFoundError
  ) {
    return createErrorResponse(error, fallback);
  }
  if (error instanceof SalesValidationError) {
    return NextResponse.json({ error: error.code }, { status: 400 });
  }
  if (error instanceof Error) {
    return NextResponse.json({ error: fallback }, { status: 500 });
  }
  return createErrorResponse(error, fallback);
}

export async function salesRateLimitKey(request: Request, sessionToken?: string) {
  if (sessionToken) return `sales-session:${sessionToken}`;
  const headerPassword = request.headers.get("X-Admin-Password");
  if (headerPassword) return `sales-header:${createHash("sha256").update(headerPassword).digest("hex")}`;
  return `sales-anon:${generateSecureToken(8)}`;
}

export function salesListParams(request: Request) {
  const url = new URL(request.url);
  return {
    search: url.searchParams.get("search"),
    limit: Number(url.searchParams.get("limit") ?? 50),
    offset: Number(url.searchParams.get("offset") ?? 0),
    dateFrom: url.searchParams.get("dateFrom"),
    dateTo: url.searchParams.get("dateTo"),
    salesperson: url.searchParams.get("salesperson"),
    eventType: url.searchParams.get("eventType"),
    status: url.searchParams.get("status"),
    nextActionFrom: url.searchParams.get("nextActionFrom"),
    nextActionTo: url.searchParams.get("nextActionTo"),
  };
}
