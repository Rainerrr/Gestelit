import { NextResponse } from "next/server";
import { requireSalesScope } from "@/lib/auth/sales-session";
import { fetchSalesClientProfile } from "@/lib/data/sales-log";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ clientRef: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const [user, { clientRef }] = await Promise.all([
      requireSalesScope("sales_personal_view"),
      context.params,
    ]);
    const url = new URL(request.url);
    const profile = await fetchSalesClientProfile({
      clientRef,
      salesUserId: user.id,
      canViewTeam: user.is_admin,
      limit: Number(url.searchParams.get("limit") ?? 30),
      offset: Number(url.searchParams.get("offset") ?? 0),
    });
    return NextResponse.json(profile);
  } catch (error) {
    const code = error instanceof Error ? error.message : "SALES_CLIENT_PROFILE_FAILED";
    if (code === "SALES_UNAUTHORIZED") {
      return NextResponse.json({ error: code }, { status: 401 });
    }
    if (code === "SALES_CLIENT_NOT_FOUND") {
      return NextResponse.json({ error: code }, { status: 404 });
    }
    console.error("SALES_CLIENT_PROFILE_FAILED", error);
    return NextResponse.json({ error: "SALES_CLIENT_PROFILE_FAILED" }, { status: 500 });
  }
}
