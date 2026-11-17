import { createHash } from "node:crypto";
import { createServiceSupabase } from "@/lib/supabase/client";

type RateLimitAction = "check" | "failure" | "success";

export type SalesLoginRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

function requestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function consume(
  keyHash: string,
  action: RateLimitAction,
  limit: number,
): Promise<SalesLoginRateLimitResult> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase.rpc("consume_sales_login_rate_limit", {
    p_key_hash: keyHash,
    p_action: action,
    p_limit: limit,
    p_window_seconds: 900,
    p_block_seconds: 900,
  });
  if (error) throw new Error("SALES_LOGIN_RATE_LIMIT_UNAVAILABLE");
  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: row?.allowed === true,
    retryAfterSeconds: Math.max(1, Number(row?.retry_after_seconds ?? 1)),
  };
}

export async function checkSalesLoginRateLimit(
  request: Request,
  email: string,
  action: RateLimitAction,
) {
  const ip = requestIp(request);
  const [ipResult, accountResult] = await Promise.all([
    consume(digest(`ip:${ip}`), action, 20),
    consume(digest(`account:${email.trim().toLowerCase()}`), action, 8),
  ]);
  return {
    allowed: ipResult.allowed && accountResult.allowed,
    retryAfterSeconds: Math.max(ipResult.retryAfterSeconds, accountResult.retryAfterSeconds),
  };
}
