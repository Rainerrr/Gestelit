import { beforeEach, describe, expect, it, vi } from "vitest";
const { from, queries } = vi.hoisted(() => ({ from: vi.fn(), queries: [] as Array<Record<string, any>> }));
vi.mock("@/lib/supabase/client", () => ({ createServiceSupabase: () => ({ from }) }));
vi.mock("@/lib/data/jobs", () => ({}));
vi.mock("@/lib/data/job-items", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
import { fetchBinaOverview, fetchBinaWorkOrders } from "@/lib/data/bina";
import { routeError } from "@/app/api/admin/bina/_route-utils";
import { UnauthorizedError, ForbiddenError, NotFoundError } from "@/lib/auth/permissions";

beforeEach(() => {
  queries.length = 0;
  from.mockImplementation((table: string) => {
    const q: Record<string, any> = { table, filters: {}, orders: [] };
    const chain: any = {};
    for (const name of ["select", "limit", "range", "order", "eq", "gt", "or"]) {
      chain[name] = (...args: any[]) => {
        if (name === "eq" || name === "gt") q.filters[args[0]] = args[1];
        else if (name === "order") q.orders.push(args);
        else q[name] = args;
        return chain;
      };
    }
    chain.then = (resolve: any) => {
      let data: any[] = [];
      let count = 28505;
      if (q.filters.link_status === "not_imported") count = 28497;
      if (q.filters.link_status === "at_risk") count = 3;
      if (q.filters.link_status === "quantity_mismatch") count = 2;
      if (table === "mart_bina_purchase_flow") {
        count = 105;
        data = [{ flow_type: "purchase_request", remaining_quantity: 2, total_amount: 10 }, { flow_type: "goods_receipt", remaining_quantity: 3, total_amount: 900 }];
      }
      if (table === "mart_bina_supplier_aging") data = [
        { supplier_code: "A", currency: "USD", open_balance: 10, overdue_balance: 1 },
        { supplier_code: "B", currency: "NIS", open_balance: 20, overdue_balance: 2 },
      ];
      return Promise.resolve({ data, count, error: null }).then(resolve);
    };
    queries.push(q);
    return chain;
  });
});

describe("BINA dashboard regressions", () => {
  it("counts the cached work orders without a 1000-row truncation", async () => {
    const overview = await fetchBinaOverview();
    expect(overview.workOrders).toEqual({ total: 28505, notImported: 28497, atRisk: 3, quantityMismatch: 2 });
    expect(overview.purchasing.openRequestLines).toBe(105);
    expect(overview.purchasing.openRequestAmount).toBe(10);
    expect(overview.scope.kind).toBe("cached_partial_snapshot");
  });
  it("keeps monetary currencies separate and does not report a mixed-currency zero", async () => {
    const { suppliers } = await fetchBinaOverview();
    expect(suppliers.openBalance).toBeNull();
    expect(suppliers.balancesByCurrency).toEqual([
      { currency: "USD", openBalance: 10, overdueBalance: 1 },
      { currency: "NIS", openBalance: 20, overdueBalance: 2 },
    ]);
  });
  it("returns newest work-order numbers with stable pagination", async () => {
    await fetchBinaWorkOrders({ limit: 12, offset: 12 });
    expect(queries[0].orders).toEqual([["work_order_id", { ascending: false, nullsFirst: false }], ["bina_id"]]);
    expect(queries[0].range).toEqual([12, 23]);
  });
  it.each([[new UnauthorizedError("Login required"), 401], [new ForbiddenError("Denied"), 403], [new NotFoundError("Missing"), 404]])("preserves expected HTTP error status", (error, status) => {
    expect(routeError(error).status).toBe(status);
  });
  it("keeps unexpected internal errors opaque", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = routeError(new Error("private database details"), "BINA_FAILED");
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("BINA_FAILED");
    expect(body.requestId).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain("private database");
    log.mockRestore();
  });
});
