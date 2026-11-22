export function previousWeek(now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - end.getUTCDay());
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function weeklyRange(start?: string) {
  const from = start ?? previousWeek().start;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new Error("INVALID_WEEK_START");
  const date = new Date(`${from}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== from) throw new Error("INVALID_WEEK_START");
  date.setUTCDate(date.getUTCDate() + 7);
  return { start: from, end: date.toISOString().slice(0, 10) };
}

export type WeeklyOrder = { id: number; customer: string; title: string; received: string; due: string | null; quantity: number | null; status: string; syncedAt: string };
export type WeeklyPurchase = { id: string; type: string; document: string; supplier: string; workOrder: number | null; date: string; syncedAt: string };
export type WeeklyStation = { name: string; rows: number; orderIds: number[]; reportedCompleteRows: number; datedCompleteRows: number };
export type WeeklySnapshot = {
  start: string; end: string; fetchedAt: string; latestSync: string | null;
  orders: WeeklyOrder[]; purchases: WeeklyPurchase[]; stations: WeeklyStation[];
  daily: Array<{ date: string; orders: number }>;
  orderCount: number; customerCount: number; purchaseCount: number; supplierCount: number;
  ordersWithRoutes: number; missingReceivedDateCount: number; missingPurchaseDateCount: number;
  scope: string;
};

export const weeklyScope = "הנתונים נבדקים מול העותק המסונכרן ב-Supabase. הכיסוי מול BINA חלקי; אין אישור לשלמות המקור. עבודות לפי תאריך קבלה, רכש לפי תאריך מסמך. תחנות הן מסלולי העבודות שהתקבלו בתקופה, ולא תפוקת מפעל שבועית.";
