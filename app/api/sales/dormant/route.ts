import { NextResponse } from "next/server";
import { requireSalesScope } from "@/lib/auth/sales-session";
import { fetchSalesDormantClients } from "@/lib/data/sales-log";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireSalesScope("sales_personal_view");
    const url = new URL(request.url);
    const requestedBucket = url.searchParams.get("bucket");
    const bucket = ["attention", "dormant", "unknown"].includes(requestedBucket ?? "")
      ? requestedBucket as "attention" | "dormant" | "unknown"
      : null;
    return NextResponse.json(await fetchSalesDormantClients({
      salesUserId: user.id,
      salesperson: user.full_name,
      bucket,
      limit: Number(url.searchParams.get("limit") ?? 100),
      offset: Number(url.searchParams.get("offset") ?? 0),
    }));
  } catch (error) {
    const code = error instanceof Error ? error.message : "SALES_DORMANT_FAILED";
    return NextResponse.json({ error: code }, { status: code === "SALES_UNAUTHORIZED" ? 401 : 500 });
  }
}
