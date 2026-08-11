import { NextResponse } from "next/server";
import { salesListParams } from "@/app/api/admin/sales-daily-log/_route-utils";
import { requireSalesScope } from "@/lib/auth/sales-session";
import { fetchSalesActivities } from "@/lib/data/sales-log";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireSalesScope("sales_team_view");
    return NextResponse.json(await fetchSalesActivities(salesListParams(request)));
  } catch (error) {
    const code = error instanceof Error ? error.message : "SALES_TEAM_ACTIVITIES_FAILED";
    return NextResponse.json({ error: code }, { status: code === "SALES_UNAUTHORIZED" ? 401 : code === "SALES_FORBIDDEN" ? 403 : 500 });
  }
}
