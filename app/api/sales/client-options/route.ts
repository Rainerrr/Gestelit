import { NextResponse } from "next/server";
import { requireSalesScope } from "@/lib/auth/sales-session";
import { createServiceSupabase } from "@/lib/supabase/client";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireSalesScope("sales_client_manage");
    const { data, error } = await createServiceSupabase().from("sales_customer_groups").select("customer_group").order("customer_group");
    if (error) throw error;
    return NextResponse.json({ groups: (data ?? []).map((r) => r.customer_group) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CLIENT_OPTIONS_FAILED";
    return NextResponse.json({ error: code }, { status: code === "SALES_UNAUTHORIZED" ? 401 : code === "SALES_FORBIDDEN" ? 403 : 500 });
  }
}
