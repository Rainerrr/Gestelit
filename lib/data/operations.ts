import {describeRowTimestamps} from "@/lib/ai/query/row-timestamps";
import { createServiceSupabase } from "@/lib/supabase/client";
import { compactDate } from "@/lib/calendar";
export async function fetchProcurementAnalysis(
  input: { from?: string; to?: string; search?: string } = {},
) {
  const to = input.to || new Date().toISOString().slice(0, 10);
  const start = new Date(to);
  start.setUTCMonth(start.getUTCMonth() - 24);
  const from = input.from || start.toISOString().slice(0, 10);
  if (
    !compactDate(from) ||
    !compactDate(to) ||
    from > to ||
    Date.parse(to) - Date.parse(from) > 3660 * 86400000
  )
    throw Error("INVALID_DATE_RANGE");
  const { data, error } = await createServiceSupabase()
    .rpc("get_procurement_analysis", {
      date_from: from,
      date_to: to,
      search_text: (input.search ?? "").trim().slice(0, 150),
    })
    .abortSignal(AbortSignal.timeout(20000));
  if (error || !data) throw Error("PROCUREMENT_UNAVAILABLE");
  return describeRowTimestamps(data);
}
export function validateOperationTask(body: Record<string, unknown>) {
  const title = String(body.title ?? "").trim();
  const status = String(body.status ?? "open"),
    category = String(body.category ?? "management");
  const due = body.due_date ? String(body.due_date) : null;
  if (
    title.length < 2 ||
    title.length > 200 ||
    !["open", "in_progress", "done", "cancelled"].includes(status) ||
    !["management", "purchasing", "maintenance", "sales"].includes(category) ||
    (due && !compactDate(due))
  )
    throw Error("INVALID_TASK");
  return {
    title,
    status,
    category,
    due_date: due,
    description: String(body.description ?? "").slice(0, 5000),
    owner_name: String(body.owner_name ?? "")
      .trim()
      .slice(0, 150),
  };
}
export function validateSupplierCapability(body: Record<string, unknown>) {
  const supplier_code = Number(body.supplier_code),
    service_name = String(body.service_name ?? "").trim(),
    unit = String(body.unit ?? "").trim(),
    currency = String(body.currency ?? "UNKNOWN");
  const unit_price =
    body.unit_price == null || body.unit_price === ""
      ? null
      : Number(body.unit_price);
  const valid_from = String(
      body.valid_from ?? new Date().toISOString().slice(0, 10),
    ),
    valid_until = body.valid_until ? String(body.valid_until) : null;
  if (
    !Number.isInteger(supplier_code) ||
    supplier_code <= 0 ||
    service_name.length < 2 ||
    service_name.length > 200 ||
    !unit ||
    unit.length > 80 ||
    !["ILS", "USD", "EUR", "GBP", "UNKNOWN"].includes(currency) ||
    (unit_price !== null && (!Number.isFinite(unit_price) || unit_price < 0)) ||
    ![valid_from, ...(valid_until ? [valid_until] : [])].every((d) =>
      compactDate(d),
    ) ||
    (valid_until && valid_until < valid_from)
  )
    throw Error("INVALID_CAPABILITY");
  return {
    supplier_code,
    service_name,
    unit,
    currency,
    unit_price,
    valid_from,
    valid_until,
    notes: String(body.notes ?? "").slice(0, 5000),
    is_active: body.is_active !== false,
  };
}
