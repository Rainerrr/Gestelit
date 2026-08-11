import { NextResponse } from "next/server";
import { SALES_SESSION_COOKIE } from "@/lib/auth/sales-session";
import { clearAdminSession } from "@/lib/auth/admin-session";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearAdminSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SALES_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  response.cookies.delete("admin_session");
  return response;
}
