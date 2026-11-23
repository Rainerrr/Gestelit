import { NextResponse } from "next/server";
import { requireSalesAdmin, salesRouteError } from "@/app/api/admin/sales-daily-log/_route-utils";
import { createServiceSupabase } from "@/lib/supabase/client";
import { normalizeSalesInteger, normalizeSalesText } from "@/lib/data/sales-log-utils";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requireSalesAdmin(request);
    const url = new URL(request.url);
    const search = url.searchParams.get("search");
    const text = normalizeSalesText(search, 120).replace(/[(),]/g, " ").replaceAll("%", "\\%").replaceAll("_", "\\_");
    const pattern = text ? `%${text}%` : null;
    const owner = url.searchParams.get("owner");
    const rawOffset = Number(url.searchParams.get("offset") ?? 0);
    const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;
    const db = createServiceSupabase();
    let query = db.from("sales_customer_directory").select("client_ref,customer_code,customer_name,salesperson,account_manager,account_manager_sales_user_id,source_updated_at", { count: "exact" })
      .order("customer_name").order("client_ref").range(offset, offset + 29);
    if (pattern) query = query.or(`customer_name.ilike.${pattern},customer_code.eq.${normalizeSalesInteger(search) ?? -1},account_manager.ilike.${pattern}`);
    if (owner === "unassigned") query = query.is("account_manager_sales_user_id", null);
    else if (owner) query = query.eq("account_manager_sales_user_id", owner);
    const [customers, users] = await Promise.all([query, db.from("sales_users").select("id,full_name").eq("is_active", true).order("full_name")]);
    if (customers.error || users.error) throw new Error("SALES_CUSTOMERS_FAILED");
    return NextResponse.json({ rows: customers.data, count: customers.count, users: users.data });
  } catch (error) { return salesRouteError(error); }
}
export async function POST(request: Request) {
  try {
    await requireSalesAdmin(request);
    const body = await request.json();
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof body.clientRef !== "string" || body.clientRef.length > 100 || !uuid.test(body.salesUserId ?? "") || (body.expectedOwner != null && !uuid.test(body.expectedOwner))) return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
    const { data, error } = await createServiceSupabase().rpc("assign_sales_customer", {
      p_client_ref: body.clientRef, p_sales_user_id: body.salesUserId, p_expected_owner: body.expectedOwner ?? null,
    });
    if (error) return NextResponse.json({ error: error.message.includes("SALES_ASSIGNMENT_CONFLICT") ? "SALES_ASSIGNMENT_CONFLICT" : "ASSIGNMENT_FAILED" }, { status: error.message.includes("SALES_ASSIGNMENT_CONFLICT") ? 409 : 400 });
    return NextResponse.json({ id: data });
  } catch (error) { return salesRouteError(error); }
}
