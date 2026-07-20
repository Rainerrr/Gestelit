import { describe, expect, it } from "vitest";
import {
  normalizeBinaClientInput,
  normalizeBinaClientText,
  isLikelySameClientName,
  validateBinaClientInput,
} from "@/lib/data/bina-client-onboarding";

describe("BINA-compatible client onboarding", () => {
  it("normalizes Hebrew client data without changing meaningful content", () => {
    expect(normalizeBinaClientInput({
      customer_name: "  אנדרח   לואיס ",
      legal_name: " אנדרח לואיס בע״מ ",
      customer_group: " שיווק ופרסום ",
      area_code: "04",
      area: " ערך ישן ",
      status: "פעיל",
      email: " Sales@Example.CO.IL ",
      city: " תל אביב ",
    })).toMatchObject({
      customer_name: "אנדרח לואיס",
      legal_name: "אנדרח לואיס בע״מ",
      customer_group: "שיווק ופרסום",
      area_code: "04",
      area: "חיפה והצפון",
      email: "sales@example.co.il",
      city: "תל אביב",
    });
  });

  it("keeps the BINA area code and canonical geographic label together", () => {
    expect(normalizeBinaClientInput({
      customer_name: "לקוח חדש",
      customer_group: "פרטי",
      area_code: "03",
    })).toMatchObject({
      area_code: "03",
      area: "תל אביב יפו והמרכז",
    });

    expect(validateBinaClientInput({
      customer_name: "לקוח חדש",
      customer_group: "פרטי",
      area_code: "99",
    })).toContain("INVALID_CLIENT_AREA");
  });

  it("requires only the fields needed to create a usable staged client", () => {
    expect(validateBinaClientInput({
      customer_name: "לקוח חדש",
      customer_group: "פרטי",
    })).toEqual([]);
    expect(validateBinaClientInput({
      customer_name: " ",
      customer_group: "",
    })).toEqual(expect.arrayContaining(["CLIENT_NAME_REQUIRED", "CLIENT_GROUP_REQUIRED"]));
  });

  it("rejects malformed accounting and contact identifiers", () => {
    expect(validateBinaClientInput({
      customer_name: "לקוח חדש",
      customer_group: "פרטי",
      email: "not-an-email",
      tax_id: "ABC123",
    })).toEqual(["INVALID_CLIENT_EMAIL", "INVALID_CLIENT_TAX_ID"]);
  });

  it("applies conservative field length limits", () => {
    expect(normalizeBinaClientText("x".repeat(500), 120)).toHaveLength(120);
    expect(normalizeBinaClientText("   ")).toBeNull();
  });

  it("flags close client names without blocking distinct companies", () => {
    expect(isLikelySameClientName("א.ל מדף", "א.ל מדף ספרים בע״מ")).toBe(true);
    expect(isLikelySameClientName("אנדרח לואיס", "אנדרח לואס")).toBe(true);
    expect(isLikelySameClientName("דפוס העיר", "חברת תאורה צפון")).toBe(false);
  });
});
