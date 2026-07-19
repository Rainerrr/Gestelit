import { describe, expect, it } from "vitest";
import {
  normalizeClientCode,
  normalizeClientIndexDate,
  normalizeClientIndexRow,
  normalizeClientIndexRows,
  normalizeClientIndexText,
} from "../../scripts/lib/client-index-import.mjs";

const source = {
  filename: "אינדקס לקוחות בינה.xlsx",
  updatedAt: "2026-07-14T09:23:26.000Z",
  importedAt: "2026-07-14T10:00:00.000Z",
};

describe("BINA client index import", () => {
  it("normalizes Hebrew client rows and preserves the canonical customer code", () => {
    expect(normalizeClientIndexRow({
      "קוד": "518149",
      "שם לקוח": "  מטריקס   קפיטל מרקטס בעמ ",
      "קבוצה": "מוסדות",
      "מצב": "פעיל",
      "מס הנהח": "518149",
      "נציג מכירות": " יובל קמחי ",
      "תאריך פתיחה": "12/5/06",
    }, source)).toMatchObject({
      customer_code: 518149,
      customer_name: "מטריקס קפיטל מרקטס בעמ",
      customer_group: "מוסדות",
      salesperson: "יובל קמחי",
      opened_at: "2006-12-05",
    });
  });

  it("rejects rows without a numeric code or usable name", () => {
    expect(normalizeClientIndexRow({ "קוד": "abc", "שם לקוח": "לקוח" }, source)).toBeNull();
    expect(normalizeClientIndexRow({ "קוד": "123", "שם לקוח": "   " }, source)).toBeNull();
  });

  it("parses Excel formatted dates without timezone date loss", () => {
    expect(normalizeClientIndexDate("1/1/08")).toBe("2008-01-01");
    expect(normalizeClientIndexDate("2026-07-14")).toBe("2026-07-14");
    expect(normalizeClientIndexDate("31/31/26")).toBeNull();
  });

  it("normalizes text and numeric codes conservatively", () => {
    expect(normalizeClientIndexText("  יובל   קמחי ")).toBe("יובל קמחי");
    expect(normalizeClientCode("100590")).toBe(100590);
    expect(normalizeClientCode("100.5")).toBeNull();
  });

  it("deduplicates repeated customer codes using the last workbook row", () => {
    const result = normalizeClientIndexRows([
      { "קוד": "10", "שם לקוח": "שם ישן" },
      { "קוד": "10", "שם לקוח": "שם מעודכן" },
      { "קוד": "11", "שם לקוח": null },
    ], source);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].customer_name).toBe("שם מעודכן");
    expect(result.skipped).toBe(1);
    expect(result.duplicates).toBe(1);
  });
});
