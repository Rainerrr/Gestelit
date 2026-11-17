import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/client";
import {
  createSalesResponseWithSession,
  loadSalesAuthorization,
  verifySalesPassword,
  type SalesUser,
} from "@/lib/auth/sales-session";
import { checkSalesLoginRateLimit } from "@/lib/auth/sales-login-rate-limit";
import { normalizeSalesText } from "@/lib/data/sales-log-utils";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = normalizeSalesText(body?.email, 240).toLowerCase();
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "EMAIL_PASSWORD_REQUIRED" }, { status: 400 });
  }

  const preflight = await checkSalesLoginRateLimit(request, email, "check").catch(() => null);
  if (!preflight) {
    return NextResponse.json({ error: "SALES_AUTHORIZATION_UNAVAILABLE" }, { status: 503 });
  }
  if (!preflight.allowed) {
    return NextResponse.json(
      { error: "SALES_LOGIN_RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(preflight.retryAfterSeconds) } },
    );
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
    const limited = await checkSalesLoginRateLimit(request, email, "failure").catch(() => null);
    if (!limited) return NextResponse.json({ error: "SALES_AUTHORIZATION_UNAVAILABLE" }, { status: 503 });
    return NextResponse.json(
      { error: limited.allowed ? "INVALID_EMAIL_OR_PASSWORD" : "SALES_LOGIN_RATE_LIMITED" },
      { status: limited.allowed ? 401 : 429, headers: limited.allowed ? undefined : { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  const authorization = await loadSalesAuthorization(data.id, supabase).catch(() => null);
  if (!authorization) {
    return NextResponse.json({ error: "SALES_AUTHORIZATION_UNAVAILABLE" }, { status: 503 });
  }
  await checkSalesLoginRateLimit(request, email, "success").catch(() => null);

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
    is_admin: authorization.scopes.includes("sales_team_view"),
    roles: authorization.roles,
    scopes: authorization.scopes,
  };

  return createSalesResponseWithSession({ user }, user);
}
