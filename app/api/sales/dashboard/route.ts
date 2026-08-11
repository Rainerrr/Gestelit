import { NextResponse } from "next/server";
import { salesListParams } from "@/app/api/admin/sales-daily-log/_route-utils";
import { requireSalesSessionUser } from "@/lib/auth/sales-session";
import { fetchSalesUserActivities, fetchSalesUserDashboard } from "@/lib/data/sales-log";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireSalesSessionUser();
    const params = salesListParams(request);
    const [summary, followUps, recent] = await Promise.all([
      fetchSalesUserDashboard(user.id, params),
      fetchSalesUserActivities(user.id, { ...params, status: "follow_up", limit: 30 }),
      fetchSalesUserActivities(user.id, { ...params, limit: 20 }),
    ]);
    return NextResponse.json({ user, summary, followUps: followUps.rows, recent: recent.rows });
  } catch {
    return NextResponse.json({ error: "SALES_UNAUTHORIZED" }, { status: 401 });
  }
}
