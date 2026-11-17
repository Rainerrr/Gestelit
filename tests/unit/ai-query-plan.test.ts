import { describe, expect, it } from "vitest";
import { validateAnalyticsPlan } from "@/lib/ai/query/plan";
describe("closed admin analytics query language", () => {
  it("accepts ad hoc grouping, scalar filters and bounded sorting", () => {
    expect(validateAnalyticsPlan({ dataset: "work_orders", groupBy: ["customer_name"], measures: [{ op: "count" }], filters: [{ column: "due_at", op: "lt", value: "2026-11-17" }], orderBy: { column: "m0", direction: "desc" }, limit: 20 }, "admin").limit).toBe(20);
  });
  it.each([
    { dataset: "sales_users" }, { dataset: "work_orders;DROP TABLE jobs" },
    { dataset: "work_orders", sql: "SELECT * FROM users" },
    { dataset: "work_orders", columns: ["*"] }, { dataset: "work_orders", columns: ["customer_name) FROM users--"] },
    { dataset: "work_orders", measures: [{ op: "pg_sleep", column: "bina_quantity" }] },
    { dataset: "work_orders", measures: [{ op: "sum", column: "customer_name" }] },
    { dataset: "work_orders", filters: [{ column: "due_at", op: "eq);DELETE", value: "x" }] },
    { dataset: "work_orders", filters: [{ column: "due_at", op: "eq", value: { sql: "now()" } }] },
    { dataset: "work_orders", filters: [{ column: "due_at", op: "is_null", value: true }] },
    { dataset: "work_orders", limit: 201 }, { dataset: "work_orders", limit: -1 },
    { dataset: "work_orders", orderBy: { column: "synced_at", direction: "desc;DROP" } },
    { dataset: "work_orders", columns: ["work_order_id"], orderBy: { column: "customer_name", direction: "asc" } },
    { dataset: "finance", groupBy: ["kind"], measures: [{ op: "sum", column: "open_amount" }] },
    { dataset: "finance", groupBy: ["currency", "kind"], measures: [{ op: "sum", column: "open_amount" }] },
  ])("rejects unapproved syntax and unsafe finance scope: %j", (plan) => {
    expect(() => validateAnalyticsPlan(plan, "admin")).toThrow("AI_QUERY");
  });
  it("rejects sales access to every admin dataset", () => {
    expect(() => validateAnalyticsPlan({ dataset: "work_orders" }, "sales")).toThrow("AI_QUERY_SCOPE_FORBIDDEN");
  });
  it("treats SQL-looking scalar values as data", () => {
    const plan = { dataset: "work_orders", filters: [{ column: "customer_name", op: "contains", value: "'); DROP TABLE jobs;--" }] };
    expect(validateAnalyticsPlan(plan, "admin")).toEqual(plan);
  });
  it("accepts amounts only with separate currency, grain, confidence groups", () => {
    expect(validateAnalyticsPlan({ dataset: "finance", groupBy: ["currency", "kind", "balance_confidence"], measures: [{ op: "sum", column: "open_amount" }] }, "admin")).toBeTruthy();
  });
});
