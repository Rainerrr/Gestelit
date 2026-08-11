import { NextResponse } from "next/server";
import { requireSalesScope } from "@/lib/auth/sales-session";
import { fetchSalesPortfolioClients } from "@/lib/data/sales-log";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireSalesScope("sales_personal_view");
    const { searchParams } = new URL(request.url);
    const result = await fetchSalesPortfolioClients({
      salesUserId: user.id,
      salesperson: user.full_name,
      search: searchParams.get("search"),
      limit: Number(searchParams.get("limit") ?? 50),
      offset: Number(searchParams.get("offset") ?? 0),
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "SALES_PORTFOLIO_FAILED";
    const status = message === "SALES_UNAUTHORIZED" ? 401 : message === "SALES_FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? "SALES_PORTFOLIO_FAILED" : message }, { status });
  }
}
