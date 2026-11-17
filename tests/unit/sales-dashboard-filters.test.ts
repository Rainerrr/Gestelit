import { describe, expect, it } from "vitest";
import {
  DEFAULT_SALES_DASHBOARD_FILTERS,
  getAppliedFilterChips,
  getQuickFilterState,
} from "@/app/admin/sales-daily-log/_components/sales-dashboard-filters";

describe("admin sales dashboard filters", () => {
  it("labels only filters that are applied beyond the default period", () => {
    expect(getAppliedFilterChips(DEFAULT_SALES_DASHBOARD_FILTERS)).toEqual([]);

    expect(getAppliedFilterChips({
      ...DEFAULT_SALES_DASHBOARD_FILTERS,
      period: "custom",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      salesperson: "מתי ברגר",
      eventType: "meeting",
      status: "won",
    })).toEqual([
      { key: "period", label: "2026-07-01 - 2026-07-31" },
      { key: "salesperson", label: "מתי ברגר" },
      { key: "eventType", label: "פגישה" },
      { key: "status", label: "נסגר" },
    ]);
  });

  it("applies a quick filter and clears it when selected again", () => {
    const applied = getQuickFilterState(DEFAULT_SALES_DASHBOARD_FILTERS, {
      eventType: "",
      status: "follow_up",
    });
    expect(applied.status).toBe("follow_up");
    expect(applied.eventType).toBe("");

    const cleared = getQuickFilterState(applied, { eventType: "", status: "follow_up" });
    expect(cleared.status).toBe("");
    expect(cleared.eventType).toBe("");
  });

  it("preserves the period and client while switching quick filters", () => {
    const next = getQuickFilterState({
      ...DEFAULT_SALES_DASHBOARD_FILTERS,
      period: "30",
      client: "לקוח לדוגמה",
      status: "open",
    }, {
      eventType: "meeting",
      status: "",
    });

    expect(next.period).toBe("30");
    expect(next.client).toBe("לקוח לדוגמה");
    expect(next.eventType).toBe("meeting");
    expect(next.status).toBe("");
  });
});
