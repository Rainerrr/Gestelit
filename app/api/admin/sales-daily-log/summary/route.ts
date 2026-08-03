import { NextResponse } from "next/server";
import { fetchSalesSummary } from "@/lib/data/sales-log";
import { requireSalesAdmin, salesListParams, salesRouteError } from "../_route-utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireSalesAdmin(request);
    return NextResponse.json(await fetchSalesSummary(salesListParams(request)));
  } catch (error) {
    return salesRouteError(error, "SALES_SUMMARY_FAILED");
  }
}
