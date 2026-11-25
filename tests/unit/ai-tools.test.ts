import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => Object.fromEntries([
  "fetchBinaPurchasing", "fetchBinaWorkOrders", "fetchBinaSuppliers", "fetchBinaFinance", "fetchBinaSales", "fetchBinaDeliveries", "fetchBinaOverview", "fetchBinaSyncStatus", "fetchBinaCrossDomainRisks", "fetchBinaWorkOrderDetail",
].map((name) => [name, vi.fn()])));
vi.mock("@/lib/data/bina", () => mocks);
vi.mock("@/lib/data/sales-log", () => ({}));
vi.mock("@/lib/ai/semantic-catalog", () => ({}));
import { runAiTool } from "@/lib/ai/tools/bina-tools";
beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(mocks)) fn.mockResolvedValue({ rows: [], count: 0 });
  mocks.fetchBinaOverview.mockResolvedValue({ purchasing: { openRequestLines: 105, openRequestAmount: 94150 }, suppliers: {}, sync: { lastSyncedAt: "2026-11-17" }, scope: { kind: "cached_partial_snapshot" } });
  mocks.fetchBinaSyncStatus.mockResolvedValue({ tables: [] });mocks.fetchBinaCrossDomainRisks.mockResolvedValue([]);
});
describe("AI evidence retrieval", () => {
  it("filters open purchase requests in the query before limiting and keeps the exact cache count", async () => {
    mocks.fetchBinaPurchasing.mockResolvedValue({ rows: [{ bina_id: "A", synced_at: "2026-11-17T10:00:00Z" }], count: 105 });
    const result = await runAiTool("get_open_purchase_requests", { limit: 3 });
    expect(mocks.fetchBinaPurchasing).toHaveBeenCalledWith({ search: undefined, limit: 3, openRequestsOnly: true });
    expect(result.data).toMatchObject({ totalMatchingCachedRows: 105, coverage: "partial_sample" });
    expect(result.freshness).toBe("2026-11-17T10:00:00Z");
  });
  it("does not give an unverified purchase amount a currency or company-total label", async () => {
    expect((await runAiTool("get_purchase_kpis", {})).data).toMatchObject({ purchasing: { sampledAmount: { currency: null, usableAsCompanyTotal: false, scope: "sample_only" } } });
  });
  it("passes sent-open delivery filtering and includes missing-dispatch semantics", async () => {
    const result = await runAiTool("get_delivery_status", { delivery_state: "sent_open", search: "28505", limit: 3 });
    expect(mocks.fetchBinaDeliveries).toHaveBeenCalledWith({ deliveryState: "sent_open", search: "28505", limit: 3 });
    expect(result.data).toMatchObject({ requestedState: "sent_open", coverage: "partial_sample" });
  });
  it("ranks by open balance when requested instead of overdue balance", async () => {
    await runAiTool("get_supplier_aging", { sort_by: "open_balance", limit: 3 });
    expect(mocks.fetchBinaSuppliers).toHaveBeenCalledWith({ search: undefined, sortBy: "open_balance", limit: 3 });
  });
  it("keeps a cross-domain response usable while explicitly declaring an unavailable risk queue", async () => {
    mocks.fetchBinaCrossDomainRisks.mockRejectedValue(new Error("statement timeout"));
    const result = await runAiTool("get_cross_domain_risk_map", {});
    expect(result.data).toMatchObject({ unavailableSources: ["mart_bina_cross_domain_risk"], coverage: "partial_sample" });
  });
  it("rejects false order relationships caused by matching a title or document number", async () => {
    const wrong = { work_order_id: 123, bina_id: "123", title: "reference 28505" };
    mocks.fetchBinaWorkOrders.mockResolvedValue({ rows: [wrong], count: 1 });
    mocks.fetchBinaPurchasing.mockResolvedValue({ rows: [wrong], count: 1 });
    mocks.fetchBinaFinance.mockResolvedValue({ rows: [{ related_work_order_id: 123 }], count: 1 });
    const result = await runAiTool("get_order_risk_evidence", { work_order_id: 28505 });
    expect(result.data).toMatchObject({ order: null, purchasing: [], finance: [], linkConfidence: { workOrder: "missing_data" } });
    expect(mocks.fetchBinaWorkOrderDetail).not.toHaveBeenCalled();
  });
  it("applies open-debt filtering before pagination", async () => {
    await runAiTool("get_open_debts", { limit: 3 });
    expect(mocks.fetchBinaFinance).toHaveBeenCalledWith({ search: undefined, limit: 3, openOnly: true });
  });
  it("looks up supplier codes as keys rather than searching names for digits", async () => {
    await runAiTool("get_supplier_evidence", { supplier_code: 60305, limit: 3 });
    expect(mocks.fetchBinaSuppliers).toHaveBeenCalledWith({ search: undefined, supplierCode: 60305, limit: 3 });
    expect(mocks.fetchBinaFinance).toHaveBeenCalledWith({ search: undefined, partyCode: 60305, partyType: "supplier", limit: 3 });
  });
  it("uses the recent open candidate set for new jobs without restricting historical search", async () => {
    await runAiTool("get_new_bina_job_candidates", { limit: 3 });
    expect(mocks.fetchBinaWorkOrders).toHaveBeenLastCalledWith({ limit: 3, dateFrom: "2024-11-01", incomingOnly: true });
    await runAiTool("search_bina_work_orders", { search: "381", limit: 1 });
    expect(mocks.fetchBinaWorkOrders).toHaveBeenLastCalledWith({ search: "381", limit: 1 });
  });
  it("does not turn unimported orders into a risk backlog", async () => {
    mocks.fetchBinaWorkOrders.mockResolvedValue({ rows: [
      { bina_id: "new", gestelit_job_id: null, link_status: "not_imported" },
      { bina_id: "active", gestelit_job_id: "job", link_status: "at_risk" },
    ], count: 2 });
    const result = await runAiTool("get_late_or_risky_work_orders", { limit: 3 });
    expect(result.rowCount).toBe(1);
    expect(JSON.stringify(result.data)).not.toContain('"new"');
  });
  it("bounds negative and oversized tool limits", async () => {
    await runAiTool("search_bina_work_orders", { limit: -10 });expect(mocks.fetchBinaWorkOrders).toHaveBeenLastCalledWith({ search: undefined, limit: 1 });
    await runAiTool("search_bina_work_orders", { limit: 100000 });expect(mocks.fetchBinaWorkOrders).toHaveBeenLastCalledWith({ search: undefined, limit: 50 });
  });
});
