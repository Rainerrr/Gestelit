import { describe, expect, it } from "vitest";
import {
  createSalesResponseWithSession,
  isSalesAdminEmail,
  type SalesUser,
} from "@/lib/auth/sales-session";

const baseUser: SalesUser = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "sales@gestelit.co.il",
  full_name: "Sales User",
  phone: null,
  is_active: true,
  is_admin: false,
};

describe("sales admin session grant", () => {
  it("recognizes Maty's account and not a regular salesperson", () => {
    delete process.env.SALES_ADMIN_EMAILS;
    expect(isSalesAdminEmail("MATY@GESTELIT.CO.IL")).toBe(true);
    expect(isSalesAdminEmail("sales@gestelit.co.il")).toBe(false);
  });

  it("does not grant an admin session to a regular salesperson", () => {
    process.env.ADMIN_SESSION_SECRET = "sales-admin-unit-test-secret";
    const response = createSalesResponseWithSession({ ok: true }, baseUser);

    expect(response.cookies.get("sales_session")?.value).toBeTruthy();
    expect(response.cookies.get("admin_session")).toBeUndefined();
  });

  it("grants an admin session to an authorized sales admin", () => {
    process.env.ADMIN_SESSION_SECRET = "sales-admin-unit-test-secret";
    const response = createSalesResponseWithSession(
      { ok: true },
      { ...baseUser, email: "maty@gestelit.co.il", is_admin: true },
    );

    expect(response.cookies.get("sales_session")?.value).toBeTruthy();
    expect(response.cookies.get("admin_session")?.value).toBeTruthy();
  });
});
