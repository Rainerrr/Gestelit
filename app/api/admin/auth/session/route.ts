import { NextResponse } from "next/server";
import {
  hasAdminSession,
  clearAdminSession,
  getSessionToken,
  createResponseWithRefreshedSession,
} from "@/lib/auth/admin-session";

/**
 * GET /api/admin/auth/session
 * Check if admin session is valid and refresh it
 */
export async function GET() {
  const hasSession = await hasAdminSession();

  if (!hasSession) {
    // Session discovery is also used by optional admin-only UI affordances.
    // Return a normal negative capability result so non-admin pages do not
    // emit a failed network request in the browser console.
    return NextResponse.json({ authenticated: false });
  }

  // Refresh the session (extend expiry)
  const token = await getSessionToken();
  if (token) {
    return createResponseWithRefreshedSession(
      { authenticated: true },
      token
    );
  }

  return NextResponse.json({ authenticated: true });
}

/**
 * DELETE /api/admin/auth/session
 * Logout - clear the admin session
 */
export async function DELETE() {
  await clearAdminSession();

  const response = NextResponse.json({ success: true });
  response.cookies.delete("admin_session");

  return response;
}
