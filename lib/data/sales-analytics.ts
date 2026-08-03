export type SalesIcpConfidence = "early_signal" | "developing" | "reliable";

export type SalesIcpSegmentRow = {
  dimension: "customer_group" | "area";
  segment: string;
  currency: string;
  activity_count: number | string | null;
  unique_clients: number | string | null;
  won_count: number | string | null;
  lost_count: number | string | null;
  open_count: number | string | null;
  won_revenue: number | string | null;
  estimated_pipeline: number | string | null;
  last_activity_at: string | null;
};

export type SalesIcpSegment = {
  dimension: "customer_group" | "area";
  segment: string;
  currency: string;
  activityCount: number;
  uniqueClients: number;
  wonCount: number;
  lostCount: number;
  openCount: number;
  wonRevenue: number;
  estimatedPipeline: number;
  conversionRate: number;
  averageWonDeal: number;
  fitScore: number;
  confidence: SalesIcpConfidence;
  lastActivityAt: string | null;
};

function finite(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getIcpConfidence(activityCount: number, uniqueClients: number, decidedCount = 0): SalesIcpConfidence {
  if (activityCount >= 20 && uniqueClients >= 5 && decidedCount >= 5) return "reliable";
  if (activityCount >= 8 && uniqueClients >= 3 && decidedCount >= 2) return "developing";
  return "early_signal";
}

export function scoreIcpSegments(rows: SalesIcpSegmentRow[]): SalesIcpSegment[] {
  const parsed = rows.map((row) => {
    const activityCount = finite(row.activity_count);
    const uniqueClients = finite(row.unique_clients);
    const wonCount = finite(row.won_count);
    const lostCount = finite(row.lost_count);
    const closedCount = wonCount + lostCount;
    const wonRevenue = finite(row.won_revenue);
    return {
      dimension: row.dimension,
      segment: row.segment || "לא מסווג",
      currency: row.currency || "ILS",
      activityCount,
      uniqueClients,
      wonCount,
      lostCount,
      openCount: finite(row.open_count),
      wonRevenue,
      estimatedPipeline: finite(row.estimated_pipeline),
      conversionRate: closedCount > 0 ? wonCount / closedCount : 0,
      averageWonDeal: wonCount > 0 ? wonRevenue / wonCount : 0,
      confidence: getIcpConfidence(activityCount, uniqueClients, closedCount),
      lastActivityAt: row.last_activity_at,
    };
  });

  return parsed.map((segment) => {
    const peers = parsed.filter((candidate) => (
      candidate.dimension === segment.dimension && candidate.currency === segment.currency
    ));
    const maxDeal = Math.max(1, ...peers.map((candidate) => candidate.averageWonDeal));
    const maxPipeline = Math.max(1, ...peers.map((candidate) => candidate.estimatedPipeline));
    const maxClients = Math.max(1, ...peers.map((candidate) => candidate.uniqueClients));
    const evidenceWeight = Math.min(1, Math.sqrt(segment.activityCount / 12));
    const evidenceAdjustedConversion = segment.wonCount / (segment.wonCount + segment.lostCount + 2);
    const rawScore = (
      evidenceAdjustedConversion * 45
      + (segment.averageWonDeal / maxDeal) * 25
      + (segment.estimatedPipeline / maxPipeline) * 15
      + (segment.uniqueClients / maxClients) * 15
    );

    return {
      ...segment,
      fitScore: Math.round(rawScore * evidenceWeight),
    };
  }).sort((a, b) => b.fitScore - a.fitScore);
}

export function calculateSalesDataQuality(rows: Array<{
  customer_code?: number | null;
  local_client_id?: string | null;
  estimated_revenue?: number | null;
  actual_revenue?: number | null;
  next_action_date?: string | null;
  contact_person?: string | null;
  status?: string | null;
}>) {
  const total = rows.length;
  const ratio = (count: number) => total > 0 ? Math.round((count / total) * 100) : 0;
  const linked = rows.filter((row) => row.customer_code != null || row.local_client_id != null).length;
  const valued = rows.filter((row) => row.estimated_revenue != null || row.actual_revenue != null).length;
  const actionable = rows.filter((row) => (
    !["won", "lost", "done"].includes(row.status ?? "") && Boolean(row.next_action_date)
  )).length;
  const open = rows.filter((row) => !["won", "lost", "done"].includes(row.status ?? "")).length;

  return {
    total,
    clientLinkRate: ratio(linked),
    valueCaptureRate: ratio(valued),
    contactCaptureRate: ratio(rows.filter((row) => Boolean(row.contact_person)).length),
    nextActionRate: open > 0 ? Math.round((actionable / open) * 100) : 0,
  };
}
