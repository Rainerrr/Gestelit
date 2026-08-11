import { NextResponse } from "next/server";
import { salesListParams } from "@/app/api/admin/sales-daily-log/_route-utils";
import { requireSalesScope } from "@/lib/auth/sales-session";
import { fetchSalesReportData } from "@/lib/data/sales-log";
import { createSalesWorkbook } from "@/lib/reports/sales-workbook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const user = await requireSalesScope("sales_export");
    const filters = salesListParams(request);
    const report = await fetchSalesReportData(filters, { salesUserId: user.id });
    const workbook = await createSalesWorkbook(report, {
      scope: "personal",
      ownerName: user.full_name,
      filters,
    });
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(workbook, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="gestelit-my-sales-${date}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "SALES_UNAUTHORIZED" }, { status: 401 });
  }
}
