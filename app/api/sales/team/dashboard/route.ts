import { NextResponse } from "next/server";
import { salesListParams } from "@/app/api/admin/sales-daily-log/_route-utils";
import { requireSalesScope } from "@/lib/auth/sales-session";
import { fetchSalesActivities, fetchSalesDashboardFilterOptions, fetchSalesSummary } from "@/lib/data/sales-log";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireSalesScope("sales_team_view");
    const params = salesListParams(request);
    const [summary, followUps, filterOptions] = await Promise.all([
      fetchSalesSummary(params),
      fetchSalesActivities({ ...params, status: "follow_up", limit: 30 }),
      fetchSalesDashboardFilterOptions(),
    ]);
    return NextResponse.json({ user, summary, followUps: followUps.rows, filterOptions });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SALES_TEAM_DASHBOARD_FAILED";
    return NextResponse.json({ error: code }, { status: code === "SALES_UNAUTHORIZED" ? 401 : code === "SALES_FORBIDDEN" ? 403 : 500 });
  }
}
