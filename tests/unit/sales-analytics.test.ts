import { describe, expect, it } from "vitest";
import { calculateSalesDataQuality, getIcpConfidence, scoreIcpSegments } from "@/lib/data/sales-analytics";

describe("sales analytics", () => {
  it("does not call a small sample reliable", () => {
    expect(getIcpConfidence(4, 2, 1)).toBe("early_signal");
    expect(getIcpConfidence(10, 3, 2)).toBe("developing");
    expect(getIcpConfidence(24, 6, 5)).toBe("reliable");
    expect(getIcpConfidence(24, 6, 1)).toBe("early_signal");
  });

  it("scores segments only against peers in the same currency and dimension", () => {
    const segments = scoreIcpSegments([
      { dimension: "area", segment: "מרכז", currency: "ILS", activity_count: 20, unique_clients: 8, won_count: 8, lost_count: 2, open_count: 3, won_revenue: 200000, estimated_pipeline: 90000, last_activity_at: null },
      { dimension: "area", segment: "צפון", currency: "ILS", activity_count: 18, unique_clients: 7, won_count: 2, lost_count: 6, open_count: 4, won_revenue: 30000, estimated_pipeline: 20000, last_activity_at: null },
      { dimension: "customer_group", segment: "דפוס", currency: "USD", activity_count: 2, unique_clients: 1, won_count: 1, lost_count: 0, open_count: 0, won_revenue: 1000000, estimated_pipeline: 0, last_activity_at: null },
    ]);

    expect(segments.find((segment) => segment.segment === "מרכז")?.fitScore).toBeGreaterThan(
      segments.find((segment) => segment.segment === "צפון")?.fitScore ?? 0,
    );
    expect(segments.find((segment) => segment.segment === "דפוס")?.confidence).toBe("early_signal");
  });

  it("reports capture quality without treating missing fields as complete", () => {
    expect(calculateSalesDataQuality([
      { customer_code: 1, estimated_revenue: 500, next_action_date: "2026-08-02", contact_person: "דן", status: "open" },
      { status: "open" },
      { local_client_id: "abc", actual_revenue: 800, status: "won" },
    ])).toEqual({
      total: 3,
      clientLinkRate: 67,
      valueCaptureRate: 67,
      contactCaptureRate: 33,
      nextActionRate: 50,
    });
  });
});
