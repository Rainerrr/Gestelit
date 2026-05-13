import { NextResponse } from "next/server";
import { createErrorResponse, requireAdminPassword } from "@/lib/auth/permissions";

export async function requireBinaAdmin(request: Request) {
  await requireAdminPassword(request, { allowQueryPassword: false });
}

export function routeError(error: unknown, fallback = "BINA_REQUEST_FAILED") {
  if (error instanceof Error) {
    return NextResponse.json({ error: fallback, message: error.message }, { status: 500 });
  }
  return createErrorResponse(error, fallback);
}

export function pagingParams(request: Request) {
  const url = new URL(request.url);
  return {
    search: url.searchParams.get("search"),
    limit: Number(url.searchParams.get("limit") ?? 50),
    offset: Number(url.searchParams.get("offset") ?? 0),
  };
}
