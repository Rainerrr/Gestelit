import { NextResponse } from "next/server";
import { createErrorResponse, requireAdminPassword } from "@/lib/auth/permissions";

export async function requireBinaAdmin(request: Request) {
  await requireAdminPassword(request, { allowQueryPassword: false });
}

export function routeError(error: unknown, fallback = "BINA_REQUEST_FAILED") {
  if (!(error instanceof Error)) {
    return createErrorResponse(error, fallback);
  }

  const requestId = crypto.randomUUID();
  console.error(`[${requestId}] ${fallback}`, error);
  return NextResponse.json({ error: fallback, requestId }, { status: 500 });
}

export function pagingParams(request: Request) {
  const url = new URL(request.url);
  return {
    search: url.searchParams.get("search"),
    limit: Number(url.searchParams.get("limit") ?? 50),
    offset: Number(url.searchParams.get("offset") ?? 0),
  };
}

function optionalNumber(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalBoolean(value: string | null) {
  return value === "true" || value === "1";
}

export function financeParams(request: Request) {
  const url = new URL(request.url);
  return {
    ...pagingParams(request),
    kind: url.searchParams.get("kind"),
    partyType: url.searchParams.get("partyType"),
    dateFrom: url.searchParams.get("dateFrom"),
    dateTo: url.searchParams.get("dateTo"),
    dueFrom: url.searchParams.get("dueFrom"),
    dueTo: url.searchParams.get("dueTo"),
    overdueOnly: optionalBoolean(url.searchParams.get("overdueOnly")),
    openOnly: optionalBoolean(url.searchParams.get("openOnly")),
    currency: url.searchParams.get("currency"),
    minAmount: optionalNumber(url.searchParams.get("minAmount")),
    maxAmount: optionalNumber(url.searchParams.get("maxAmount")),
    agingBucket: url.searchParams.get("agingBucket"),
    dateQuality: url.searchParams.get("dateQuality"),
  };
}
