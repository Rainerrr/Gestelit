/** Deliberately excludes auth tokens, arbitrary URL parameters and DOM text. */
const filterKeys = ["search", "q", "tab", "status", "client", "customer", "customerGroup", "area", "eventType", "salesperson", "accountManager", "dateFrom", "dateTo", "scope", "coverage", "dormancyBucket", "id", "workOrderId"];
export function currentScreenFilters(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return Object.fromEntries(filterKeys.flatMap((key) => params.has(key) ? [[key, params.get(key)!.slice(0, 200)]] : []));
}
/** Client context is a bounded navigation hint, never authority or factual evidence. */
export function sanitizeScreenContext(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = ["pathname", "routeLabel", "screen", "activeTab", "search", "filters", "selectedEntity", "visibleSummary"];
  const clean = (item: unknown, depth: number): unknown => {
    if (typeof item === "string") return item.slice(0, 500);
    if (typeof item === "number") return Number.isFinite(item) ? item : null;
    if (typeof item === "boolean" || item === null) return item;
    if (depth > 1 || !item || typeof item !== "object") return null;
    if (Array.isArray(item)) return item.slice(0, 12).map((part) => clean(part, depth + 1));
    return Object.fromEntries(Object.entries(item).slice(0, 16).map(([key, part]) => [key.slice(0, 60), clean(part, depth + 1)]));
  };
  return Object.fromEntries(Object.entries(value).filter(([key]) => allowed.includes(key)).map(([key, item]) => [key, clean(item, 0)]));
}

/** Read live component state at send time. Explicit controls override stale URL filters. */
export function mergeScreenContext(base: Record<string, unknown>, published: Record<string, unknown>, urlFilters: Record<string, string>) {
  const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return sanitizeScreenContext({ ...base, ...published,
    selectedEntity: { ...record(base.selectedEntity), ...record(published.selectedEntity) },
    filters: { ...urlFilters, ...record(base.filters), ...record(published.filters) },
  });
}
