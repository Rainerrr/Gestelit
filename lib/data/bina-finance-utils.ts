export type BinaFinanceDateQuality = "valid" | "missing" | "suspicious";

const MIN_REASONABLE_YEAR = 2000;
const MAX_REASONABLE_YEAR = 2035;

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function classifyBinaFinanceDateQuality(documentAt?: string | null, dueAt?: string | null): BinaFinanceDateQuality {
  const dates = [parseDate(documentAt), parseDate(dueAt)].filter((date): date is Date => Boolean(date));
  if (dates.length === 0) return "missing";
  return dates.some((date) => {
    const year = date.getUTCFullYear();
    return year < MIN_REASONABLE_YEAR || year > MAX_REASONABLE_YEAR;
  }) ? "suspicious" : "valid";
}

export function getBinaFinanceAgingBucket(dueAt: string | null | undefined, openAmount: number | null | undefined, now = new Date()): string {
  const dueDate = parseDate(dueAt);
  if (!dueDate || !openAmount || openAmount <= 0) return "לא רלוונטי";
  const diffDays = Math.floor((now.getTime() - dueDate.getTime()) / 86_400_000);
  if (diffDays <= 0) return "שוטף";
  if (diffDays <= 30) return "1-30";
  if (diffDays <= 60) return "31-60";
  if (diffDays <= 90) return "61-90";
  return "90+";
}

export function isBinaFinanceOverdue(dueAt: string | null | undefined, openAmount: number | null | undefined, now = new Date()) {
  const dueDate = parseDate(dueAt);
  return Boolean(dueDate && openAmount && openAmount > 0 && dueDate.getTime() < now.getTime());
}
