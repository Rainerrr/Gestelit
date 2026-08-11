import { NextResponse } from "next/server";
import { requireSalesAdmin, salesListParams, salesRouteError } from "../_route-utils";
import { fetchSalesReportData } from "@/lib/data/sales-log";
import { createSalesWorkbook } from "@/lib/reports/sales-workbook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    await requireSalesAdmin(request);
    const filters = salesListParams(request);
    const report = await fetchSalesReportData(filters);
    const workbook = await createSalesWorkbook(report, { scope: "admin", filters });
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(workbook, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="gestelit-sales-management-${date}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return salesRouteError(error, "SALES_EXPORT_FAILED");
  }
}
