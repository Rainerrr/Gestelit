import { describe, expect, it } from "vitest";
import {
  isSalesEventType,
  normalizeSalesDateTime,
  normalizeSalesDate,
  normalizeSalesInteger,
  normalizeSalesNumber,
  validateSalesActivityPatch,
  validateSalesActivityPayload,
} from "@/lib/data/sales-log-utils";

describe("sales log utilities", () => {
  it("accepts only supported sales event types", () => {
    expect(isSalesEventType("call")).toBe(true);
    expect(isSalesEventType("meeting")).toBe(true);
    expect(isSalesEventType("invoice")).toBe(false);
  });

  it("normalizes numeric revenue fields", () => {
    expect(normalizeSalesNumber("1200")).toBe(1200);
    expect(normalizeSalesNumber("")).toBeNull();
    expect(normalizeSalesNumber("abc")).toBeNull();
    expect(normalizeSalesInteger("1200.5")).toBeNull();
    expect(normalizeSalesInteger("1200")).toBe(1200);
  });

  it("normalizes invalid dates to a valid ISO string", () => {
    expect(normalizeSalesDateTime("2026-05-14T08:30:00.000Z")).toBe("2026-05-14T08:30:00.000Z");
    expect(new Date(normalizeSalesDateTime("not-a-date")).toString()).not.toBe("Invalid Date");
    expect(normalizeSalesDate("2026-05-14")).toBe("2026-05-14");
    expect(normalizeSalesDate("14/05/2026")).toBeNull();
  });

  it("validates required activity fields", () => {
    expect(validateSalesActivityPayload({
      event_type: "call",
      salesperson: "Idan",
      customer_name: "Client",
      raw_note: "Talked about renewal",
      estimated_revenue: 5000,
    })).toEqual([]);

    expect(validateSalesActivityPayload({
      event_type: "bad",
      salesperson: "",
      customer_name: "",
      raw_note: "",
      estimated_revenue: -1,
    })).toEqual(expect.arrayContaining([
      "INVALID_EVENT_TYPE",
      "SALESPERSON_REQUIRED",
      "CUSTOMER_REQUIRED",
      "NOTE_REQUIRED",
      "INVALID_ESTIMATED_REVENUE",
    ]));
  });

  it("validates partial updates without allowing corrupt sales data", () => {
    expect(validateSalesActivityPatch({ status: "done" })).toEqual([]);
    expect(validateSalesActivityPatch({
      salesperson: "",
      actual_revenue: -5,
      ai_confidence: "certain",
    })).toEqual(expect.arrayContaining([
      "SALESPERSON_REQUIRED",
      "INVALID_ACTUAL_REVENUE",
      "INVALID_AI_CONFIDENCE",
    ]));
  });
});
