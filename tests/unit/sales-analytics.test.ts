import { describe, expect, it } from "vitest";
import {
  buildFilteredSalesAnalytics,
  calculateSalesDataQuality,
  getIcpConfidence,
  scoreIcpSegments,
  type SalesAnalyticsActivityRow,
} from "@/lib/data/sales-analytics";

function activity(update: Partial<SalesAnalyticsActivityRow>): SalesAnalyticsActivityRow {
  return {
    event_type: "call",
    event_at: "2026-08-01T09:00:00.000Z",
    salesperson: "נועה",
    customer_name: "לקוח א",
    customer_code: 10,
    local_client_id: null,
    contact_person: "דנה",
    raw_note: "שיחה",
    ai_summary: null,
    ai_next_action: null,
    next_action_date: null,
    estimated_revenue: null,
    actual_revenue: null,
    currency: "ILS",
    status: "open",
    customer_group: "תעשייה",
    area: "מרכז",
    ...update,
  };
}

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

  it("recalculates every aggregate from the supplied filtered row set", () => {
    const result = buildFilteredSalesAnalytics([
      activity({ estimated_revenue: 50_000, next_action_date: "2026-07-30", status: "follow_up" }),
      activity({ event_at: "2026-08-02T10:00:00.000Z", customer_name: "לקוח ב", customer_code: 11, status: "won", actual_revenue: 20_000 }),
      activity({ event_at: "2026-08-02T11:00:00.000Z", customer_name: "לקוח ג", customer_code: 12, status: "lost" }),
    ], { periodDays: 30, now: new Date("2026-08-03T12:00:00.000Z") });

    expect(result.analytics.filteredCount).toBe(3);
    expect(result.estimatedPipeline).toBe(50_000);
    expect(result.actualLoggedRevenue).toBe(20_000);
    expect(result.analytics.funnel).toMatchObject({ open: 1, won: 1, lost: 1, winRate: 0.5 });
    expect(result.analytics.reps[0]).toMatchObject({ activityCount: 3, uniqueClients: 3, overdueFollowUps: 1 });
    expect(result.analytics.opportunities[0]).toMatchObject({ customerName: "לקוח א", overdueFollowUps: 1 });
    expect(result.analytics.dataQuality.outcomeClosureRate).toBe(67);
  });

  it("keeps currencies separate and exposes truncation", () => {
    const result = buildFilteredSalesAnalytics([
      activity({ currency: "ILS", estimated_revenue: 1000 }),
      activity({ currency: "USD", estimated_revenue: 2000 }),
    ], { periodDays: 7, isTruncated: true });

    expect(result.analytics.currencies).toEqual(expect.arrayContaining([
      expect.objectContaining({ currency: "ILS", estimatedPipeline: 1000 }),
      expect.objectContaining({ currency: "USD", estimatedPipeline: 2000 }),
    ]));
    expect(result.analytics.isTruncated).toBe(true);
  });
});
