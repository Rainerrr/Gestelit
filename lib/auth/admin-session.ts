import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const ADMIN_SESSION_COOKIE = "admin_session";
const ADMIN_SESSION_MAX_AGE = 15 * 60; // 15 minutes in seconds

/**
 * Create a simple session token
 * In production, consider using a more secure token generation method
 */
function generateSessionToken(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `${timestamp}_${random}`;
}

/**
 * Set the admin session cookie
 * Called after successful password validation
 */
export async function setAdminSession(): Promise<string> {
  const token = generateSessionToken();
  const cookieStore = await cookies();

  cookieStore.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ADMIN_SESSION_MAX_AGE,
    path: "/",
  });

  return token;
}

/**
 * Refresh the admin session cookie (extend expiry)
 * Called on each authenticated request to implement sliding expiration
 */
export async function refreshAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const existingToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!existingToken) {
    return false;
  }

  // Re-set the cookie with a fresh maxAge to extend the session
  cookieStore.set(ADMIN_SESSION_COOKIE, existingToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ADMIN_SESSION_MAX_AGE,
    path: "/",
  });

  return true;
}

/**
 * Check if admin session cookie exists and is valid
 */
export async function hasAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  return Boolean(token);
}

/**
 * Clear the admin session cookie
 */
export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

/**
 * Create a response with the admin session cookie set
 */
export function createResponseWithSession<T>(
  data: T,
  status = 200
): NextResponse<T> {
  const token = generateSessionToken();
  const response = NextResponse.json(data, { status });

  response.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ADMIN_SESSION_MAX_AGE,
    path: "/",
  });

  return response;
}

/**
 * Create a response that refreshes the session cookie
 */
export function createResponseWithRefreshedSession<T>(
  data: T,
  existingToken: string,
  status = 200
): NextResponse<T> {
  const response = NextResponse.json(data, { status });

  response.cookies.set(ADMIN_SESSION_COOKIE, existingToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ADMIN_SESSION_MAX_AGE,
    path: "/",
  });

  return response;
}

/**
 * Get the current session token from cookies
 */
export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ADMIN_SESSION_COOKIE)?.value ?? null;
}
