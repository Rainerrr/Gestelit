import { NextResponse } from "next/server";
import { salesListParams } from "@/app/api/admin/sales-daily-log/_route-utils";
import { requireSalesScope } from "@/lib/auth/sales-session";
import { fetchSalesPortfolioClients, fetchSalesUserActivities, fetchSalesUserDashboard } from "@/lib/data/sales-log";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireSalesScope("sales_personal_view");
    const params = salesListParams(request);
    const [summary, followUps, recent, portfolio] = await Promise.all([
      fetchSalesUserDashboard(user.id, params),
      fetchSalesUserActivities(user.id, { ...params, status: "follow_up", limit: 30 }),
      fetchSalesUserActivities(user.id, { ...params, limit: 20 }),
      fetchSalesPortfolioClients({
        salesUserId: user.id,
        salesperson: user.full_name,
        search: params.client,
        limit: 12,
      }),
    ]);
    return NextResponse.json({
      user,
      summary,
      followUps: followUps.rows,
      recent: recent.rows,
      portfolio: portfolio.rows,
      portfolioCount: portfolio.count,
      portfolioCoverage: portfolio.coverage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SALES_DASHBOARD_FAILED";
    const status = message === "SALES_UNAUTHORIZED" ? 401 : message === "SALES_FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? "SALES_DASHBOARD_FAILED" : message }, { status });
  }
}
