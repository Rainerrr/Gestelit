import { NextResponse } from "next/server";
import { salesListParams } from "@/app/api/admin/sales-daily-log/_route-utils";
import { requireSalesScope } from "@/lib/auth/sales-session";
import { fetchSalesReportData } from "@/lib/data/sales-log";
import { createSalesWorkbook } from "@/lib/reports/sales-workbook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const user = await requireSalesScope("sales_team_view");
    if (!user.scopes.includes("sales_team_view")) {
      return NextResponse.json({ error: "SALES_FORBIDDEN" }, { status: 403 });
    }
    const filters = salesListParams(request);
    const report = await fetchSalesReportData(filters);
    const workbook = await createSalesWorkbook(report, { scope: "admin", ownerName: user.full_name, filters });
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(workbook, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="gestelit-sales-team-${date}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SALES_EXPORT_FAILED";
    return NextResponse.json({ error: code }, { status: code === "SALES_UNAUTHORIZED" ? 401 : code === "SALES_FORBIDDEN" ? 403 : 500 });
  }
}
