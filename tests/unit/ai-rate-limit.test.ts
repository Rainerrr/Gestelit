import { describe, expect, it } from "vitest";
import { checkInMemoryRateLimit } from "@/lib/ai/rate-limit";

describe("AI rate limiting", () => {
  it("allows requests up to the configured bucket limit", () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    expect(checkInMemoryRateLimit(key, { limit: 2, windowMs: 60_000 }).allowed).toBe(true);
    const second = checkInMemoryRateLimit(key, { limit: 2, windowMs: 60_000 });
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
  });

  it("blocks requests after the bucket is exhausted", () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    checkInMemoryRateLimit(key, { limit: 1, windowMs: 60_000 });
    const blocked = checkInMemoryRateLimit(key, { limit: 1, windowMs: 60_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });
});
