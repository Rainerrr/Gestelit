import { NextResponse } from "next/server";
import { getSalesSessionUser } from "@/lib/auth/sales-session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSalesSessionUser();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user });
}
