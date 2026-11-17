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

describe("redundant grouped projection canonicalization", () => {
  it("accepts the captured model plan only after removing equivalent grouping columns", async () => {
    const { validateSalesAnalyticsPlan } = await import("@/lib/ai/query/plan");
    const plan = validateSalesAnalyticsPlan({ dataset: "sales_activity", columns: ["salesperson", "currency"], groupBy: ["salesperson", "currency"], measures: [{ op: "count" }], filters: [{ column: "event_at", op: "gte", value: "2026-01-01T00:00:00.000Z" }], orderBy: { column: "salesperson", direction: "asc" }, limit: 50 });
    expect(plan).not.toHaveProperty("columns");
    expect(plan.groupBy).toEqual(["salesperson", "currency"]);
  });
  it("accepts the same safe redundancy for admin grouped queries", () => {
    expect(validateAnalyticsPlan({ dataset: "work_orders", columns: ["customer_name"], groupBy: ["customer_name"], measures: [{ op: "count" }] }, "admin")).not.toHaveProperty("columns");
  });
  it.each([
    { columns: ["customer_name"], groupBy: ["salesperson"] },
    { columns: ["salesperson", "customer_name"], groupBy: ["salesperson"] },
    { columns: ["salesperson"] },
    { columns: ["salesperson", "salesperson"], groupBy: ["salesperson", "currency"] },
    { columns: ["salesperson) FROM sales_users--"], groupBy: ["salesperson) FROM sales_users--"] },
  ])("continues rejecting mismatched projections or identifier escapes: %j", async (projection) => {
    const { validateSalesAnalyticsPlan } = await import("@/lib/ai/query/plan");
    expect(() => validateSalesAnalyticsPlan({ dataset: "sales_activity", ...projection, measures: [{ op: "count" }] })).toThrow("AI_QUERY");
  });
});
