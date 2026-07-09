import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createServiceSupabase } from "@/lib/supabase/client";

export const SALES_SESSION_COOKIE = "sales_session";
const SALES_SESSION_MAX_AGE = 60 * 60 * 12;

export type SalesUser = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
};

type SalesSessionPayload = {
  v: 1;
  sub: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
  jti: string;
};

function getSigningSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET ?? process.env.ADMIN_PASSWORD;
  if (!secret) {
    throw new Error("SALES_SESSION_SECRET_MISSING");
  }
  return secret;
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signPayload(payload: string) {
  return crypto.createHmac("sha256", getSigningSecret()).update(payload).digest("base64url");
}

function timingSafeEqualText(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function hashSalesPassword(password: string, salt = crypto.randomBytes(16).toString("base64url")) {
  const key = crypto.scryptSync(password, salt, 64).toString("base64url");
  return `scrypt$${salt}$${key}`;
}

export function verifySalesPassword(password: string, storedHash: string) {
  const [scheme, salt, key] = storedHash.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = hashSalesPassword(password, salt).split("$")[2];
  return timingSafeEqualText(expected, key);
}

function createSalesSessionToken(user: SalesUser, nowSeconds = Math.floor(Date.now() / 1000)) {
  const payload = base64UrlJson({
    v: 1,
    sub: user.id,
    email: user.email,
    name: user.full_name,
    iat: nowSeconds,
    exp: nowSeconds + SALES_SESSION_MAX_AGE,
    jti: crypto.randomBytes(16).toString("base64url"),
  } satisfies SalesSessionPayload);
  return `${payload}.${signPayload(payload)}`;
}

export function verifySalesSessionToken(token: string | null | undefined): SalesSessionPayload | null {
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;

  const expected = signPayload(payload);
  if (!timingSafeEqualText(expected, signature)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<SalesSessionPayload>;
    const now = Math.floor(Date.now() / 1000);
    if (
      parsed.v !== 1
      || typeof parsed.sub !== "string"
      || typeof parsed.email !== "string"
      || typeof parsed.name !== "string"
      || typeof parsed.exp !== "number"
      || parsed.exp <= now
    ) {
      return null;
    }
    return parsed as SalesSessionPayload;
  } catch {
    return null;
  }
}

export function createSalesResponseWithSession<T>(data: T, user: SalesUser, status = 200) {
  const response = NextResponse.json(data, { status });
  response.cookies.set(SALES_SESSION_COOKIE, createSalesSessionToken(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SALES_SESSION_MAX_AGE,
    path: "/",
  });
  return response;
}

export async function clearSalesSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SALES_SESSION_COOKIE);
}

export async function getSalesSessionUser(): Promise<SalesUser | null> {
  const cookieStore = await cookies();
  const session = verifySalesSessionToken(cookieStore.get(SALES_SESSION_COOKIE)?.value);
  if (!session) return null;

  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("sales_users")
    .select("id,email,full_name,phone,is_active")
    .eq("id", session.sub)
    .maybeSingle();

  if (error || !data || data.is_active !== true) return null;
  return data as SalesUser;
}

export async function requireSalesSessionUser() {
  const user = await getSalesSessionUser();
  if (!user) {
    throw new Error("SALES_UNAUTHORIZED");
  }
  return user;
}
