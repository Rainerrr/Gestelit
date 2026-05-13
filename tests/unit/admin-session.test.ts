import { describe, expect, it } from "vitest";
import { verifyAdminSessionToken } from "@/lib/auth/admin-session";

describe("admin session verification", () => {
  it("rejects the previous unsafe opaque-cookie shape", () => {
    process.env.ADMIN_SESSION_SECRET = "unit-test-secret";
    expect(verifyAdminSessionToken("just-a-random-cookie-value")).toBe(false);
  });

  it("rejects malformed signed cookies", () => {
    process.env.ADMIN_SESSION_SECRET = "unit-test-secret";
    expect(verifyAdminSessionToken("payload.signature.extra")).toBe(false);
    expect(verifyAdminSessionToken("payload")).toBe(false);
  });
});
