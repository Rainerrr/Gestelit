import { describe, expect, it } from "vitest";
import { parseSalesAuthorizationRows } from "@/lib/auth/sales-session";
import { selectSalesHeadlineCurrency } from "@/lib/data/sales-log";
import { validateSalesAttachment } from "@/lib/utils/storage";

describe("sales security hardening", () => {
  it("accepts only database roles and scopes and fails closed when none are valid", () => {
    expect(parseSalesAuthorizationRows(
      [{ role_key: "sales_manager" }, { role_key: "unknown" }],
      [{ scope_key: "sales_team_view" }, { scope_key: "root" }],
    )).toEqual({ roles: ["sales_manager"], scopes: ["sales_team_view"] });

    expect(() => parseSalesAuthorizationRows([], [{ scope_key: "sales_team_view" }]))
      .toThrow("SALES_FORBIDDEN");
    expect(() => parseSalesAuthorizationRows([{ role_key: "sales_rep" }], []))
      .toThrow("SALES_FORBIDDEN");
  });

  it("never chooses a cross-currency sum for headline money", () => {
    const base = {
      activity_count: 1,
      unique_client_count: 1,
      open_count: 1,
      won_count: 0,
      lost_count: 0,
      meeting_count: 0,
      call_count: 1,
      lead_count: 0,
      sale_count: 0,
      follow_up_count: 0,
      open_follow_up_count: 0,
      overdue_follow_up_count: 0,
      estimated_pipeline: 100,
      won_revenue: 0,
      coverage_scope: "gestelit_only",
      is_complete_contact_history: false,
      freshness_at: null,
    };
    const selected = selectSalesHeadlineCurrency([
      { ...base, currency_code: "USD" },
      { ...base, currency_code: "ILS", estimated_pipeline: 500 },
    ]);
    expect(selected?.currency_code).toBe("ILS");
    expect(selected?.estimated_pipeline).toBe(500);
    expect(selectSalesHeadlineCurrency([
      { ...base, currency_code: "USD" },
      { ...base, currency_code: "EUR" },
    ])).toBeUndefined();
  });

  it("rejects unsupported and oversized attachments before persistence", () => {
    expect(() => validateSalesAttachment(new File(["hello"], "note.txt", { type: "text/plain" })))
      .toThrow("INVALID_FILE_TYPE");
    const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" });
    expect(() => validateSalesAttachment(oversized)).toThrow("FILE_TOO_LARGE");
    expect(() => validateSalesAttachment(new File(["pdf"], "ok.pdf", { type: "application/pdf" })))
      .not.toThrow();
  });
});
