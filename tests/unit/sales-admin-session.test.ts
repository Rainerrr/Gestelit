import { describe, expect, it } from "vitest";
import {
  createSalesResponseWithSession,
  parseSalesAuthorizationRows,
  type SalesUser,
} from "@/lib/auth/sales-session";

const baseUser: SalesUser = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "sales@gestelit.co.il",
  full_name: "Sales User",
  phone: null,
  is_active: true,
  is_admin: false,
  roles: ["sales_rep"],
  scopes: ["sales_activity_write", "sales_personal_view", "sales_export", "sales_ai_query"],
};

describe("sales admin session grant", () => {
  it("derives authorization only from persisted role and scope rows", () => {
    expect(
      parseSalesAuthorizationRows(
        [{ role_key: "sales_manager" }],
        [{ scope_key: "sales_team_view" }, { scope_key: "sales_client_manage" }],
      ),
    ).toEqual({
      roles: ["sales_manager"],
      scopes: ["sales_team_view", "sales_client_manage"],
    });

    expect(() => parseSalesAuthorizationRows([], [])).toThrow("SALES_FORBIDDEN");
  });

  it("does not grant an admin session to a regular salesperson", () => {
    process.env.ADMIN_SESSION_SECRET = "sales-admin-unit-test-secret";
    const response = createSalesResponseWithSession({ ok: true }, baseUser);

    expect(response.cookies.get("sales_session")?.value).toBeTruthy();
    expect(response.cookies.get("admin_session")).toBeUndefined();
  });

  it("keeps a sales manager scoped to sales without granting a MES admin session", () => {
    process.env.ADMIN_SESSION_SECRET = "sales-admin-unit-test-secret";
    const response = createSalesResponseWithSession(
      { ok: true },
      {
        ...baseUser,
        email: "maty@gestelit.co.il",
        is_admin: true,
        roles: ["sales_manager"],
        scopes: [...baseUser.scopes, "sales_team_view", "sales_client_manage"],
      },
    );

    expect(response.cookies.get("sales_session")?.value).toBeTruthy();
    expect(response.cookies.get("admin_session")).toBeUndefined();
  });
});
