import { NextResponse } from "next/server";
import { requireSalesScope } from "@/lib/auth/sales-session";
import { fetchBinaClientIndex } from "@/lib/data/sales-log";
import {
  BinaClientValidationError,
  createPendingBinaClient,
  type PendingBinaClientInput,
} from "@/lib/data/bina-client-onboarding";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireSalesScope("sales_personal_view");
    const url = new URL(request.url);
    const canViewTeam = user.scopes.includes("sales_team_view");
    const onlyMine = !canViewTeam || url.searchParams.get("mine") === "true";
    return NextResponse.json(await fetchBinaClientIndex({
      search: url.searchParams.get("search"),
      salesUserId: onlyMine ? user.id : undefined,
      limit: Number(url.searchParams.get("limit") ?? 30),
      offset: Number(url.searchParams.get("offset") ?? 0),
    }));
  } catch (error) {
    if (error instanceof Error && error.message === "SALES_UNAUTHORIZED") {
      return NextResponse.json({ error: "SALES_UNAUTHORIZED" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "SALES_FORBIDDEN") {
      return NextResponse.json({ error: "SALES_FORBIDDEN" }, { status: 403 });
    }
    return NextResponse.json({ error: "CLIENT_INDEX_FAILED" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSalesScope("sales_client_manage");
    const body = await request.json().catch(() => null) as PendingBinaClientInput | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
    }
    const client = await createPendingBinaClient(user, body);
    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "SALES_UNAUTHORIZED") {
      return NextResponse.json({ error: "SALES_UNAUTHORIZED" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "SALES_FORBIDDEN") {
      return NextResponse.json({ error: "SALES_FORBIDDEN" }, { status: 403 });
    }
    if (error instanceof BinaClientValidationError) {
      const existingClient = "existingClient" in error
        ? (error as BinaClientValidationError & { existingClient?: unknown }).existingClient
        : undefined;
      return NextResponse.json(
        { error: error.code, existingClient },
        { status: error.code === "CLIENT_ALREADY_EXISTS" ? 409 : 400 },
      );
    }
    return NextResponse.json({ error: "CLIENT_CREATE_FAILED" }, { status: 500 });
  }
}
