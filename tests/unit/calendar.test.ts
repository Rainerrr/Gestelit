import { describe, expect, it } from "vitest";
import { buildSalesFollowUpCalendarUrl } from "@/lib/calendar";

describe("sales follow-up calendar URL", () => {
  it("builds an all-day Google Calendar event with sales context", () => {
    const value = buildSalesFollowUpCalendarUrl({
      date: "2026-07-20",
      customerName: "דפוס הצפון",
      customerCode: 714,
      nextAction: "לשלוח הצעת מחיר",
      calendarNote: "לחזור ללקוח אחרי אישור מנהל",
      eventTypeLabel: "פגישה",
      contactPerson: "יובל",
      salesperson: "נועה",
      estimatedRevenue: 12500,
      currency: "ILS",
    });

    expect(value).not.toBeNull();
    const url = new URL(value as string);
    expect(url.origin).toBe("https://calendar.google.com");
    expect(url.searchParams.get("dates")).toBe("20260720/20260721");
    expect(url.searchParams.get("text")).toBe("פולואפ עם דפוס הצפון");
    expect(url.searchParams.get("details")).toContain("הערה ליומן: לחזור ללקוח אחרי אישור מנהל");
    expect(url.searchParams.get("details")).toContain("פעולה הבאה: לשלוח הצעת מחיר");
    expect(url.searchParams.get("details")).toContain("קוד לקוח BINA: 714");
    expect(url.searchParams.get("details")).toContain("איש קשר: יובל");
    expect(url.searchParams.get("details")).toContain("איש מכירות: נועה");
    expect(url.searchParams.get("details")).toContain("סכום מוערך:");
    expect(url.searchParams.get("details")).toContain("12,500");
    expect(url.searchParams.get("ctz")).toBe("Asia/Jerusalem");
  });

  it("handles month boundaries", () => {
    const value = buildSalesFollowUpCalendarUrl({ date: "2026-07-31" });
    expect(new URL(value as string).searchParams.get("dates")).toBe("20260731/20260801");
  });

  it("rejects missing or impossible dates", () => {
    expect(buildSalesFollowUpCalendarUrl({ date: "" })).toBeNull();
    expect(buildSalesFollowUpCalendarUrl({ date: "2026-02-31" })).toBeNull();
    expect(buildSalesFollowUpCalendarUrl({ date: "20-07-2026" })).toBeNull();
  });
});
