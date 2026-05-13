import { NextResponse } from "next/server";
import { fetchBinaWorkOrders } from "@/lib/data/bina";
import { pagingParams, requireBinaAdmin, routeError } from "../_route-utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireBinaAdmin(request);
    const result = await fetchBinaWorkOrders(pagingParams(request));
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error, "BINA_WORK_ORDERS_FAILED");
  }
}
