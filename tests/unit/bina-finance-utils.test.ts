import { describe, expect, it } from "vitest";
import {
  classifyBinaFinanceDateQuality,
  getBinaFinanceAgingBucket,
  isBinaFinanceOverdue,
} from "@/lib/data/bina-finance-utils";

describe("BINA finance utilities", () => {
  const now = new Date("2026-05-14T00:00:00Z");

  it("flags impossible BINA finance dates as suspicious", () => {
    expect(classifyBinaFinanceDateQuality("4202-02-20T00:00:00Z", "2026-05-01T00:00:00Z")).toBe("suspicious");
    expect(classifyBinaFinanceDateQuality("2026-05-01T00:00:00Z", "1999-12-31T00:00:00Z")).toBe("suspicious");
  });

  it("separates missing dates from valid dates", () => {
    expect(classifyBinaFinanceDateQuality(null, null)).toBe("missing");
    expect(classifyBinaFinanceDateQuality("2026-05-01T00:00:00Z", "2026-05-30T00:00:00Z")).toBe("valid");
  });

  it("uses due date and open amount for aging buckets", () => {
    expect(getBinaFinanceAgingBucket("2026-05-20T00:00:00Z", 100, now)).toBe("שוטף");
    expect(getBinaFinanceAgingBucket("2026-05-01T00:00:00Z", 100, now)).toBe("1-30");
    expect(getBinaFinanceAgingBucket("2026-03-15T00:00:00Z", 100, now)).toBe("31-60");
    expect(getBinaFinanceAgingBucket("2026-02-15T00:00:00Z", 100, now)).toBe("61-90");
    expect(getBinaFinanceAgingBucket("2026-01-01T00:00:00Z", 100, now)).toBe("90+");
  });

  it("does not treat missing or zero balances as overdue", () => {
    expect(isBinaFinanceOverdue("2026-05-01T00:00:00Z", 100, now)).toBe(true);
    expect(isBinaFinanceOverdue("2026-05-01T00:00:00Z", 0, now)).toBe(false);
    expect(isBinaFinanceOverdue(null, 100, now)).toBe(false);
  });
});
