import { NextResponse } from "next/server";
import { createSalesActivity, fetchSalesActivities } from "@/lib/data/sales-log";
import { requireSalesAdmin, salesListParams, salesRouteError } from "./_route-utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireSalesAdmin(request);
    return NextResponse.json(await fetchSalesActivities(salesListParams(request)));
  } catch (error) {
    return salesRouteError(error, "SALES_LOG_FAILED");
  }
}

export async function POST(request: Request) {
  try {
    await requireSalesAdmin(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
    }
    return NextResponse.json(await createSalesActivity(body), { status: 201 });
  } catch (error) {
    return salesRouteError(error, "SALES_LOG_CREATE_FAILED");
  }
}
