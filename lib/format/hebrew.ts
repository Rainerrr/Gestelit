const months = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

/** Business dates must not change with the viewer's time zone. */
export function hebrewDate(value: string, includeYear = true): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.slice(0, 10));
  if (!match) return value;
  const [, y, m, d] = match;
  const parsed = new Date(`${y}-${m}-${d}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== `${y}-${m}-${d}`) return value;
  return `${Number(d)} ב${months[Number(m) - 1]}${includeYear ? ` ${y}` : ""}`;
}

export function hebrewDateRange(from: string, to: string): string {
  return `${hebrewDate(from)} עד ${hebrewDate(to)}`;
}

export function hebrewTimestamp(value?: string | null): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  const d = new Date(value);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${hebrewDate(date)} בשעה ${time}`;
}

/** Display-only normalization; never modifies stored answers or business values. */
export function readableHebrewDates(text: string): string {
  return text
    .replace(/\b(\d{1,2})[–—-](\d{1,2})\.(\d{1,2})\.(\d{4})\b/g, (original, from, to, month, year) => {
      const a = `${year}-${month.padStart(2, "0")}-${from.padStart(2, "0")}`;
      const b = `${year}-${month.padStart(2, "0")}-${to.padStart(2, "0")}`;
      if (hebrewDate(a) === a || hebrewDate(b) === b || Number(from) > Number(to)) return original;
      return `${Number(from)} עד ${hebrewDate(b)}`;
    })
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, (value) => hebrewDate(value))
    .replace(/\b(\d{1,2})([./])(\d{1,2})\2(\d{4})\b/g, (original, day, _separator, month, year) => {
      const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      const formatted = hebrewDate(iso);
      return formatted === iso ? original : formatted;
    });
}
