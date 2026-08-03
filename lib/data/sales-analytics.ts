export type SalesIcpConfidence = "early_signal" | "developing" | "reliable";

export type SalesAnalyticsActivityRow = {
  event_type: string;
  event_at: string;
  salesperson: string;
  customer_name: string;
  customer_code: number | null;
  local_client_id: string | null;
  contact_person: string | null;
  raw_note: string;
  ai_summary: string | null;
  ai_next_action: string | null;
  next_action_date: string | null;
  estimated_revenue: number | string | null;
  actual_revenue: number | string | null;
  currency: string | null;
  status: string;
  customer_group: string | null;
  area: string | null;
};

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

function clientKey(row: SalesAnalyticsActivityRow) {
  return String(row.customer_code ?? row.local_client_id ?? row.customer_name.trim().toLocaleLowerCase("he-IL"));
}

function israelDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function openStatus(status: string) {
  return status === "new" || status === "open" || status === "follow_up";
}

type CurrencyTotals = {
  currency: string;
  estimatedPipeline: number;
  wonRevenue: number;
  wonCount: number;
  openCount: number;
};

export function buildFilteredSalesAnalytics(
  rows: SalesAnalyticsActivityRow[],
  options: { periodDays: number; now?: Date; isTruncated?: boolean },
) {
  const now = options.now ?? new Date();
  const today = israelDate(now);
  const todayTime = new Date(`${today}T00:00:00+03:00`).getTime();
  const dailyMap = new Map<string, {
    date: string;
    currency: string;
    activityCount: number;
    clients: Set<string>;
    wonCount: number;
    lostCount: number;
    estimatedPipeline: number;
    wonRevenue: number;
  }>();
  const repMap = new Map<string, {
    salesperson: string;
    currency: string;
    activityCount: number;
    clients: Set<string>;
    wonCount: number;
    lostCount: number;
    openCount: number;
    overdueFollowUps: number;
    estimatedPipeline: number;
    wonRevenue: number;
    lastActivityAt: string | null;
  }>();
  const eventMap = new Map<string, { activityCount: number; clients: Set<string>; wonCount: number }>();
  const icpMap = new Map<string, SalesIcpSegmentRow & { clients: Set<string> }>();
  const opportunityMap = new Map<string, {
    clientKey: string;
    customerName: string;
    customerCode: number | null;
    localClientId: string | null;
    salesperson: string;
    currency: string;
    activityCount: number;
    estimatedPipeline: number;
    overdueFollowUps: number;
    nextActionDate: string | null;
    lastActivityAt: string | null;
    latestContext: string | null;
    customerGroup: string;
    area: string;
  }>();
  const currencyMap = new Map<string, CurrencyTotals>();
  const topClientMap = new Map<string, {
    customer_name: string;
    customer_code: number | null;
    local_client_id: string | null;
    activity_count: number;
    estimated_pipeline: number;
    last_activity_at: string | null;
    salesperson: string | null;
    customer_group: string | null;
  }>();

  let open = 0;
  let won = 0;
  let lost = 0;
  let openFollowUps = 0;
  let overdueFollowUps = 0;
  let estimatedPipeline = 0;
  let actualLoggedRevenue = 0;
  let todayCount = 0;
  let weekCount = 0;

  for (const row of rows) {
    const currency = row.currency || "ILS";
    const key = clientKey(row);
    const eventTime = new Date(row.event_at).getTime();
    const isOpen = openStatus(row.status);
    const isWon = row.status === "won";
    const isLost = row.status === "lost";
    const estimate = finite(row.estimated_revenue);
    const actual = finite(row.actual_revenue);
    const overdue = row.status === "follow_up" && Boolean(row.next_action_date) && row.next_action_date! < today;
    const date = israelDate(row.event_at);

    if (date === today) todayCount += 1;
    if (eventTime >= todayTime - 6 * 86_400_000) weekCount += 1;
    if (isOpen) {
      open += 1;
      estimatedPipeline += estimate;
    }
    if (isWon) {
      won += 1;
      actualLoggedRevenue += actual;
    }
    if (isLost) lost += 1;
    if (row.status === "follow_up") openFollowUps += 1;
    if (overdue) overdueFollowUps += 1;

    const dailyKey = `${date}|${currency}`;
    const daily = dailyMap.get(dailyKey) ?? {
      date,
      currency,
      activityCount: 0,
      clients: new Set<string>(),
      wonCount: 0,
      lostCount: 0,
      estimatedPipeline: 0,
      wonRevenue: 0,
    };
    daily.activityCount += 1;
    daily.clients.add(key);
    if (isWon) {
      daily.wonCount += 1;
      daily.wonRevenue += actual;
    }
    if (isLost) daily.lostCount += 1;
    if (isOpen) daily.estimatedPipeline += estimate;
    dailyMap.set(dailyKey, daily);

    const repKey = `${row.salesperson}|${currency}`;
    const rep = repMap.get(repKey) ?? {
      salesperson: row.salesperson || "לא משויך",
      currency,
      activityCount: 0,
      clients: new Set<string>(),
      wonCount: 0,
      lostCount: 0,
      openCount: 0,
      overdueFollowUps: 0,
      estimatedPipeline: 0,
      wonRevenue: 0,
      lastActivityAt: null,
    };
    rep.activityCount += 1;
    rep.clients.add(key);
    if (isWon) {
      rep.wonCount += 1;
      rep.wonRevenue += actual;
    }
    if (isLost) rep.lostCount += 1;
    if (isOpen) {
      rep.openCount += 1;
      rep.estimatedPipeline += estimate;
    }
    if (overdue) rep.overdueFollowUps += 1;
    if (!rep.lastActivityAt || row.event_at > rep.lastActivityAt) rep.lastActivityAt = row.event_at;
    repMap.set(repKey, rep);

    const event = eventMap.get(row.event_type) ?? { activityCount: 0, clients: new Set<string>(), wonCount: 0 };
    event.activityCount += 1;
    event.clients.add(key);
    if (isWon) event.wonCount += 1;
    eventMap.set(row.event_type, event);

    for (const [dimension, segment] of [
      ["customer_group", row.customer_group || "לא מסווג"],
      ["area", row.area || "לא מסווג"],
    ] as const) {
      const icpKey = `${dimension}|${segment}|${currency}`;
      const icp = icpMap.get(icpKey) ?? {
        dimension,
        segment,
        currency,
        activity_count: 0,
        unique_clients: 0,
        won_count: 0,
        lost_count: 0,
        open_count: 0,
        won_revenue: 0,
        estimated_pipeline: 0,
        last_activity_at: null,
        clients: new Set<string>(),
      };
      icp.activity_count = finite(icp.activity_count) + 1;
      icp.clients.add(key);
      icp.unique_clients = icp.clients.size;
      if (isWon) {
        icp.won_count = finite(icp.won_count) + 1;
        icp.won_revenue = finite(icp.won_revenue) + actual;
      }
      if (isLost) icp.lost_count = finite(icp.lost_count) + 1;
      if (isOpen) {
        icp.open_count = finite(icp.open_count) + 1;
        icp.estimated_pipeline = finite(icp.estimated_pipeline) + estimate;
      }
      if (!icp.last_activity_at || row.event_at > icp.last_activity_at) icp.last_activity_at = row.event_at;
      icpMap.set(icpKey, icp);
    }

    const totals = currencyMap.get(currency) ?? { currency, estimatedPipeline: 0, wonRevenue: 0, wonCount: 0, openCount: 0 };
    if (isOpen) {
      totals.estimatedPipeline += estimate;
      totals.openCount += 1;
    }
    if (isWon) {
      totals.wonRevenue += actual;
      totals.wonCount += 1;
    }
    currencyMap.set(currency, totals);

    const topClient = topClientMap.get(key) ?? {
      customer_name: row.customer_name,
      customer_code: row.customer_code,
      local_client_id: row.local_client_id,
      activity_count: 0,
      estimated_pipeline: 0,
      last_activity_at: null,
      salesperson: row.salesperson,
      customer_group: row.customer_group,
    };
    topClient.activity_count += 1;
    if (isOpen) topClient.estimated_pipeline += estimate;
    if (!topClient.last_activity_at || row.event_at > topClient.last_activity_at) {
      topClient.last_activity_at = row.event_at;
      topClient.customer_name = row.customer_name;
      topClient.salesperson = row.salesperson;
    }
    topClientMap.set(key, topClient);

    if (isOpen) {
      const opportunityKey = `${key}|${currency}`;
      const current = opportunityMap.get(opportunityKey) ?? {
        clientKey: key,
        customerName: row.customer_name,
        customerCode: row.customer_code,
        localClientId: row.local_client_id,
        salesperson: row.salesperson,
        currency,
        activityCount: 0,
        estimatedPipeline: 0,
        overdueFollowUps: 0,
        nextActionDate: null,
        lastActivityAt: null,
        latestContext: null,
        customerGroup: row.customer_group || "לא מסווג",
        area: row.area || "לא מסווג",
      };
      current.activityCount += 1;
      current.estimatedPipeline += estimate;
      if (overdue) current.overdueFollowUps += 1;
      if (row.next_action_date && (!current.nextActionDate || row.next_action_date < current.nextActionDate)) {
        current.nextActionDate = row.next_action_date;
      }
      if (!current.lastActivityAt || row.event_at > current.lastActivityAt) {
        current.lastActivityAt = row.event_at;
        current.customerName = row.customer_name;
        current.salesperson = row.salesperson;
        current.latestContext = row.ai_next_action || row.ai_summary || row.raw_note;
        current.customerGroup = row.customer_group || "לא מסווג";
        current.area = row.area || "לא מסווג";
      }
      opportunityMap.set(opportunityKey, current);
    }
  }

  const reps = Array.from(repMap.values()).map((row) => ({
    salesperson: row.salesperson,
    currency: row.currency,
    activityCount: row.activityCount,
    uniqueClients: row.clients.size,
    wonCount: row.wonCount,
    lostCount: row.lostCount,
    openCount: row.openCount,
    overdueFollowUps: row.overdueFollowUps,
    estimatedPipeline: row.estimatedPipeline,
    wonRevenue: row.wonRevenue,
    conversionRate: row.wonCount + row.lostCount > 0 ? row.wonCount / (row.wonCount + row.lostCount) : 0,
    lastActivityAt: row.lastActivityAt,
  })).sort((left, right) => right.estimatedPipeline - left.estimatedPipeline);

  const opportunities = Array.from(opportunityMap.values()).map((row) => {
    const inactiveDays = row.lastActivityAt
      ? Math.max(0, Math.floor((todayTime - new Date(row.lastActivityAt).getTime()) / 86_400_000))
      : 0;
    return {
      ...row,
      inactiveDays,
      priorityScore: Math.min(50, row.overdueFollowUps * 20)
        + Math.min(30, Math.floor(row.estimatedPipeline / 5000))
        + Math.min(20, inactiveDays),
    };
  }).sort((left, right) => right.priorityScore - left.priorityScore).slice(0, 12);

  const total = rows.length;
  const openRows = rows.filter((row) => openStatus(row.status));
  const ratio = (count: number, denominator = total) => denominator > 0 ? Math.round((count / denominator) * 100) : 0;

  return {
    todayCount,
    weekCount,
    openFollowUps,
    overdueFollowUps,
    estimatedPipeline,
    actualLoggedRevenue,
    topClients: Array.from(topClientMap.values())
      .sort((left, right) => right.estimated_pipeline - left.estimated_pipeline || right.activity_count - left.activity_count)
      .slice(0, 8),
    analytics: {
      periodDays: options.periodDays,
      filteredCount: total,
      isTruncated: options.isTruncated ?? false,
      funnel: {
        open,
        won,
        lost,
        winRate: won + lost > 0 ? won / (won + lost) : 0,
      },
      eventMix: Array.from(eventMap.entries()).map(([eventType, row]) => ({
        eventType,
        activityCount: row.activityCount,
        uniqueClients: row.clients.size,
        wonCount: row.wonCount,
      })).sort((left, right) => right.activityCount - left.activityCount),
      daily: Array.from(dailyMap.values()).map((row) => ({
        date: row.date,
        currency: row.currency,
        activityCount: row.activityCount,
        uniqueClients: row.clients.size,
        wonCount: row.wonCount,
        lostCount: row.lostCount,
        estimatedPipeline: row.estimatedPipeline,
        wonRevenue: row.wonRevenue,
      })).sort((left, right) => left.date.localeCompare(right.date)),
      currencies: Array.from(currencyMap.values()),
      reps,
      icpSegments: scoreIcpSegments(Array.from(icpMap.values())),
      opportunities,
      dataQuality: {
        total,
        clientLinkRate: ratio(rows.filter((row) => row.customer_code != null || row.local_client_id != null).length),
        valueCaptureRate: ratio(rows.filter((row) => row.estimated_revenue != null || row.actual_revenue != null).length),
        contactCaptureRate: ratio(rows.filter((row) => Boolean(row.contact_person)).length),
        nextActionRate: ratio(openRows.filter((row) => Boolean(row.next_action_date)).length, openRows.length),
        outcomeClosureRate: ratio(rows.filter((row) => row.status === "won" || row.status === "lost").length),
        lostOutcomeCount: lost,
      },
    },
  };
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
