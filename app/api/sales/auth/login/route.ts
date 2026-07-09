import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/client";
import {
  createSalesResponseWithSession,
  verifySalesPassword,
  type SalesUser,
} from "@/lib/auth/sales-session";
import { normalizeSalesText } from "@/lib/data/sales-log-utils";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = normalizeSalesText(body?.email, 240).toLowerCase();
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "EMAIL_PASSWORD_REQUIRED" }, { status: 400 });
  }

  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("sales_users")
    .select("id,email,full_name,phone,is_active,password_hash")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "SALES_LOGIN_FAILED" }, { status: 500 });
  }

  if (!data || data.is_active !== true || !verifySalesPassword(password, data.password_hash)) {
    return NextResponse.json({ error: "INVALID_EMAIL_OR_PASSWORD" }, { status: 401 });
  }

  await supabase
    .from("sales_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", data.id);

  const user: SalesUser = {
    id: data.id,
    email: data.email,
    full_name: data.full_name,
    phone: data.phone,
    is_active: data.is_active,
  };

  return createSalesResponseWithSession({ user }, user);
}
