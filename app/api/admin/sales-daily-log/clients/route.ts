import { NextResponse } from "next/server";
import { fetchSalesClients } from "@/lib/data/sales-log";
import { requireSalesAdmin, salesRouteError } from "../_route-utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireSalesAdmin(request);
    const url = new URL(request.url);
    return NextResponse.json(await fetchSalesClients({
      search: url.searchParams.get("search"),
      limit: Number(url.searchParams.get("limit") ?? 20),
    }));
  } catch (error) {
    return salesRouteError(error, "SALES_CLIENTS_FAILED");
  }
}
