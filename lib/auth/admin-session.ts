import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import crypto from "node:crypto";

const ADMIN_SESSION_COOKIE = "admin_session";
const ADMIN_SESSION_MAX_AGE = 60 * 60; // 60 minutes in seconds

type AdminSessionPayload = {
  v: 1;
  iat: number;
  exp: number;
  jti: string;
};

function getSigningSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET ?? process.env.ADMIN_PASSWORD;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET or ADMIN_PASSWORD environment variable not configured");
  }
  return secret;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signPayload(payload: string): string {
  return crypto.createHmac("sha256", getSigningSecret()).update(payload).digest("base64url");
}

function createSessionToken(nowSeconds = Math.floor(Date.now() / 1000)): string {
  const payload = base64UrlJson({
    v: 1,
    iat: nowSeconds,
    exp: nowSeconds + ADMIN_SESSION_MAX_AGE,
    jti: crypto.randomBytes(16).toString("base64url"),
  } satisfies AdminSessionPayload);
  return `${payload}.${signPayload(payload)}`;
}

export function verifyAdminSessionToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;

  const expected = signPayload(payload);
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(signature);
  if (expectedBytes.length !== actualBytes.length || !crypto.timingSafeEqual(expectedBytes, actualBytes)) {
    return false;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<AdminSessionPayload>;
    const now = Math.floor(Date.now() / 1000);
    return parsed.v === 1 && typeof parsed.exp === "number" && parsed.exp > now;
  } catch {
    return false;
  }
}

/**
 * Set the admin session cookie
 * Called after successful password validation
 */
export async function setAdminSession(): Promise<string> {
  const token = createSessionToken();
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

  if (!verifyAdminSessionToken(existingToken)) {
    return false;
  }

  // Issue a fresh signed token to implement sliding expiration.
  cookieStore.set(ADMIN_SESSION_COOKIE, createSessionToken(), {
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
  return verifyAdminSessionToken(token);
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
  const token = createSessionToken();
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

  response.cookies.set(ADMIN_SESSION_COOKIE, verifyAdminSessionToken(existingToken) ? createSessionToken() : existingToken, {
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
