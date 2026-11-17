import type { BinaSyncCoverageRow } from "@/lib/data/bina";

export function selectMetricTrust(coverage: BinaSyncCoverageRow[], requestedDomain?: string) {
  const aliases: Record<string, string> = { supplier: "suppliers", delivery: "deliveries", purchase: "purchasing", work_orders: "production" };
  const input = requestedDomain?.trim().toLowerCase();
  const domain = input ? aliases[input] ?? input : undefined;
  const rows = coverage.filter((row) => !domain || row.domain === domain || (
    domain === "suppliers" && ["Hovot", "IndexSapak", "TMSapakNigrar"].includes(row.source_table)
  ));
  const coverageStatus = rows.length === 0 ? "missing_data"
    : rows.some((row) => row.coverage_status === "blocked_partial_sample") ? "blocked_partial_sample"
    : rows.some((row) => row.coverage_status !== "complete") ? "partial_sample"
    : "complete";
  return { domain: domain ?? null, coverageStatus, rows };
}
