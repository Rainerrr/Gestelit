import { createServiceSupabase } from "@/lib/supabase/client";
import { weeklyRange, weeklyScope, type WeeklyOrder, type WeeklyPurchase, type WeeklySnapshot, type WeeklyStation } from "@/lib/bina/weekly";

// All pages are read, or the request fails. Never silently publish a first-page total.
async function allPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from <= 10000; from += 500) {
    const result = await page(from, from + 499);
    if (result.error || !result.data) throw new Error("WEEKLY_SOURCE_UNAVAILABLE");
    rows.push(...result.data);
    if (rows.length > 10000) throw new Error("WEEKLY_RESULT_TOO_LARGE");
    if (result.data.length < 500) return rows;
  }
  throw new Error("WEEKLY_RESULT_TOO_LARGE");
}
type RawOrder = { bina_id: string; data: Record<string, unknown>; synced_at: string };
type Purchase = { bina_id: string; flow_type: string; document_no: string; supplier_name: string; supplier_code: number | null; work_order_id: number | null; document_at: string; synced_at: string };
type Route = { bina_id: string; data: Record<string, unknown>; synced_at: string };
const str = (v: unknown) => typeof v === "string" ? v.trim() : "";
const day = (v: unknown) => /^\d{4}-\d{2}-\d{2}/.test(str(v)) ? str(v).slice(0, 10) : null;

export async function fetchBinaWeekly(start?: string): Promise<WeeklySnapshot> {
  const range = weeklyRange(start);
  const db = createServiceSupabase();
  const [raw, purchasing, missing] = await Promise.all([
    allPages<RawOrder>((from, to) => db.from("bina_dfhazmrashi").select("bina_id,data,synced_at")
      .gte("data->>TarikKabala", range.start).lt("data->>TarikKabala", range.end).order("bina_id").range(from, to)),
    allPages<Purchase>((from, to) => db.from("mart_bina_purchase_flow")
      .select("bina_id,flow_type,document_no,supplier_name,supplier_code,work_order_id,document_at,synced_at")
      .gte("document_at", `${range.start}T00:00:00Z`).lt("document_at", `${range.end}T00:00:00Z`)
      .order("flow_type").order("bina_id").range(from, to)),
    db.from("bina_dfhazmrashi").select("bina_id", { count: "exact", head: true }).is("data->>TarikKabala", null),
  ]);
  if (missing.error) throw new Error("WEEKLY_SOURCE_UNAVAILABLE");
  const orders: WeeklyOrder[] = raw.map(({ bina_id, data: d, synced_at }) => ({
    id: Number(d.MisparDFHazmana ?? bina_id), customer: str(d.ShemLako), title: str(d.Koteret),
    received: day(d.TarikKabala)!, due: day(d.TarikAspaka),
    quantity: d.Kamut === null || d.Kamut === undefined || d.Kamut === "" || !Number.isFinite(Number(d.Kamut)) ? null : Number(d.Kamut),
    status: str(d.Status1), syncedAt: synced_at,
  })).sort((a, b) => b.received.localeCompare(a.received) || b.id - a.id);
  const ids = orders.map((o) => o.id);
  const routes: Route[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    routes.push(...await allPages<Route>((from, to) => db.from("bina_dfshelita").select("bina_id,data,synced_at")
      .in("data->>MisparRashi", ids.slice(i, i + 100).map(String)).order("bina_id").range(from, to)));
  }
  const stations = new Map<string, WeeklyStation>();
  const routedOrders = new Set<number>();
  for (const { data: d } of routes) {
    const id = Number(d.MisparRashi);
    const name = str(d.Mekona) || "תחנה לא מצוינת";
    const station = stations.get(name) ?? { name, rows: 0, orderIds: [], reportedCompleteRows: 0, datedCompleteRows: 0 };
    station.rows++;
    if (!station.orderIds.includes(id)) station.orderIds.push(id);
    if (String(d.Status) === "2") station.reportedCompleteRows++;
    const ended = day(d.TarikEnd);
    if (ended && ended >= range.start && ended < range.end) station.datedCompleteRows++;
    stations.set(name, station);
    routedOrders.add(id);
  }
  const purchases: WeeklyPurchase[] = purchasing.map((p) => ({ id: p.bina_id, type: p.flow_type, document: p.document_no, supplier: str(p.supplier_name), workOrder: p.work_order_id || null, date: p.document_at.slice(0, 10), syncedAt: p.synced_at }));
  const timestamps = [...raw, ...routes, ...purchasing].map((r) => r.synced_at).filter(Boolean).sort();
  const daily = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${range.start}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    return { date, orders: orders.filter((o) => o.received === date).length };
  });
  return { ...range, fetchedAt: new Date().toISOString(), latestSync: timestamps.at(-1) ?? null,
    orders, purchases, stations: [...stations.values()].sort((a, b) => b.orderIds.length - a.orderIds.length || a.name.localeCompare(b.name)), daily,
    orderCount: orders.length, customerCount: new Set(raw.map((r) => String(r.data.Kodlako ?? r.data.ShemLako))).size,
    purchaseCount: purchases.length, supplierCount: new Set(purchasing.map((p) => p.supplier_code ?? p.supplier_name)).size,
    ordersWithRoutes: routedOrders.size, missingReceivedDateCount: missing.count ?? 0, scope: weeklyScope };
}
