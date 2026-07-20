import { createServiceSupabase } from "@/lib/supabase/client";

export const BINA_CLIENT_GROUP_OPTIONS = [
  "פרטי",
  "פרסום",
  "משרד פרסום",
  "שיווק ופרסום",
  "סופר חנויות קימונאות",
  "סוכנות",
  "קבלנים",
  "קניונים",
  "ציוד רפואי",
  "ריהוט",
  "תאורה",
  "תעשייה",
  "עיריות ומועצות אזוריות",
  "עמותה",
] as const;

export const BINA_CLIENT_AREA_OPTIONS = [
  { code: "02", label: "ירושלים" },
  { code: "03", label: "תל אביב יפו והמרכז" },
  { code: "04", label: "חיפה והצפון" },
  { code: "08", label: "השפלה והדרום" },
] as const;

export const BINA_CLIENT_STATUS_OPTIONS = ["פעיל", "פעיל מועדף", "לא פעיל"] as const;

export type PendingBinaClientInput = {
  customer_name: string;
  legal_name?: string | null;
  customer_group: string;
  area_code?: string | null;
  area?: string | null;
  status?: string | null;
  customer_warehouse?: string | null;
  address_line?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  po_box?: string | null;
  postal_code?: string | null;
  bookkeeping_no?: string | null;
  tax_id?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  salesperson?: string | null;
  notes?: string | null;
  allow_similar_name?: boolean;
};

export type PendingBinaClient = {
  id: string;
  bina_customer_code: number | null;
  customer_name: string;
  legal_name: string | null;
  customer_group: string;
  area_code: string | null;
  area: string | null;
  status: string;
  customer_warehouse: string | null;
  address_line: string | null;
  neighborhood: string | null;
  city: string | null;
  po_box: string | null;
  postal_code: string | null;
  bookkeeping_no: string | null;
  tax_id: string | null;
  contact_person: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  salesperson: string | null;
  notes: string | null;
  sync_status: "pending" | "ready" | "synced" | "failed" | "rejected";
  created_by_sales_user: string;
  created_at: string;
  updated_at: string;
};

export class BinaClientValidationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "BinaClientValidationError";
  }
}

export function normalizeBinaClientText(value: unknown, maxLength = 250) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, maxLength);
  return normalized || null;
}

export function normalizeBinaClientInput(input: PendingBinaClientInput): PendingBinaClientInput {
  const areaCode = normalizeBinaClientText(input.area_code, 2);
  const knownArea = BINA_CLIENT_AREA_OPTIONS.find((option) => option.code === areaCode);

  return {
    customer_name: normalizeBinaClientText(input.customer_name, 200) ?? "",
    legal_name: normalizeBinaClientText(input.legal_name, 200),
    customer_group: normalizeBinaClientText(input.customer_group, 120) ?? "",
    area_code: areaCode,
    area: knownArea?.label ?? normalizeBinaClientText(input.area, 120),
    status: normalizeBinaClientText(input.status, 50) ?? "פעיל",
    customer_warehouse: normalizeBinaClientText(input.customer_warehouse, 120),
    address_line: normalizeBinaClientText(input.address_line, 250),
    neighborhood: normalizeBinaClientText(input.neighborhood, 120),
    city: normalizeBinaClientText(input.city, 120),
    po_box: normalizeBinaClientText(input.po_box, 30),
    postal_code: normalizeBinaClientText(input.postal_code, 20),
    bookkeeping_no: normalizeBinaClientText(input.bookkeeping_no, 50),
    tax_id: normalizeBinaClientText(input.tax_id, 30),
    contact_person: normalizeBinaClientText(input.contact_person, 120),
    phone: normalizeBinaClientText(input.phone, 30),
    mobile: normalizeBinaClientText(input.mobile, 30),
    email: normalizeBinaClientText(input.email, 200)?.toLowerCase() ?? null,
    salesperson: normalizeBinaClientText(input.salesperson, 120),
    notes: normalizeBinaClientText(input.notes, 2000),
  };
}

export function validateBinaClientInput(input: PendingBinaClientInput) {
  const normalized = normalizeBinaClientInput(input);
  const errors: string[] = [];
  if (normalized.customer_name.length < 2) errors.push("CLIENT_NAME_REQUIRED");
  if (!normalized.customer_group) errors.push("CLIENT_GROUP_REQUIRED");
  if (normalized.area_code && !BINA_CLIENT_AREA_OPTIONS.some((option) => option.code === normalized.area_code)) {
    errors.push("INVALID_CLIENT_AREA");
  }
  if (normalized.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) errors.push("INVALID_CLIENT_EMAIL");
  if (normalized.tax_id && !/^[0-9-]{5,15}$/.test(normalized.tax_id)) errors.push("INVALID_CLIENT_TAX_ID");
  return errors;
}

function comparableClientName(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("he")
    .replace(/בע["״']?מ/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

export function isLikelySameClientName(left: string, right: string) {
  const normalizedLeft = comparableClientName(left);
  const normalizedRight = comparableClientName(right);
  if (Math.min(normalizedLeft.length, normalizedRight.length) < 4) return false;
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return true;
  const distance = editDistance(normalizedLeft, normalizedRight);
  return distance <= Math.max(1, Math.floor(Math.max(normalizedLeft.length, normalizedRight.length) * 0.18));
}

function escapeLike(value: string) {
  return value.replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export async function createPendingBinaClient(
  salesUser: { id: string; full_name: string },
  input: PendingBinaClientInput,
) {
  const normalized = normalizeBinaClientInput({
    ...input,
    salesperson: input.salesperson || salesUser.full_name,
  });
  const errors = validateBinaClientInput(normalized);
  if (errors.length > 0) throw new BinaClientValidationError(errors[0]);

  const supabase = createServiceSupabase();
  const { data: possibleMatches, error: matchError } = await supabase
    .from("mart_sales_client_directory")
    .select("client_ref,local_client_id,customer_code,customer_name,source,sync_status")
    .ilike("customer_name", escapeLike(normalized.customer_name))
    .limit(5);
  if (matchError) throw new Error(matchError.message);

  const exactMatch = (possibleMatches ?? []).find((row) => (
    String(row.customer_name).localeCompare(normalized.customer_name, "he", { sensitivity: "base" }) === 0
  ));
  if (exactMatch) {
    const error = new BinaClientValidationError("CLIENT_ALREADY_EXISTS");
    Object.assign(error, { existingClient: exactMatch });
    throw error;
  }

  if (input.allow_similar_name !== true) {
    const { data: similarMatches, error: similarError } = await supabase.rpc(
      "search_sales_client_activity",
      { p_search: normalized.customer_name, p_limit: 5 },
    );
    if (similarError) throw new Error(similarError.message);
    const likelyMatches = (similarMatches ?? []).filter((row: { customer_name?: string | null }) => (
      isLikelySameClientName(normalized.customer_name, String(row.customer_name ?? ""))
    ));
    if (likelyMatches.length > 0) {
      throw new BinaClientValidationError("CLIENT_SIMILAR_EXISTS");
    }
  }

  const { data, error } = await supabase
    .from("pending_bina_clients")
    .insert({
      ...normalized,
      created_by_sales_user: salesUser.id,
      sync_status: "pending",
    })
    .select("*")
    .single();
  if (error?.code === "23505") throw new BinaClientValidationError("CLIENT_ALREADY_EXISTS");
  if (error) throw new Error(error.message);
  return data as PendingBinaClient;
}
