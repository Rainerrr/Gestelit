type SalesFollowUpCalendarInput = {
  date: string | null | undefined;
  customerName?: string | null;
  customerCode?: number | string | null;
  nextAction?: string | null;
  calendarNote?: string | null;
  eventTypeLabel?: string | null;
  contactPerson?: string | null;
  salesperson?: string | null;
  estimatedRevenue?: number | string | null;
  currency?: string | null;
};

function compactDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${match[1]}${match[2]}${match[3]}`;
}

function nextCompactDate(value: string) {
  const compact = compactDate(value);
  if (!compact) return null;

  const date = new Date(Date.UTC(
    Number(compact.slice(0, 4)),
    Number(compact.slice(4, 6)) - 1,
    Number(compact.slice(6, 8)) + 1,
  ));

  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

export function buildSalesFollowUpCalendarUrl(input: SalesFollowUpCalendarInput) {
  const date = input.date?.trim() ?? "";
  const startDate = compactDate(date);
  const endDate = nextCompactDate(date);
  if (!startDate || !endDate) return null;

  const customerName = input.customerName?.trim() || "לקוח";
  const calendarNote = input.calendarNote?.trim() || "";
  const nextAction = input.nextAction?.trim() || "";
  const estimatedRevenue = Number(input.estimatedRevenue);
  const formattedRevenue = Number.isFinite(estimatedRevenue) && estimatedRevenue > 0
    ? new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: input.currency?.trim() || "ILS",
      maximumFractionDigits: 0,
    }).format(estimatedRevenue)
    : null;
  const details = [
    calendarNote ? `הערה ליומן: ${calendarNote}` : null,
    nextAction && nextAction !== calendarNote ? `פעולה הבאה: ${nextAction}` : null,
    input.customerCode != null && String(input.customerCode).trim()
      ? `קוד לקוח BINA: ${String(input.customerCode).trim()}`
      : null,
    input.contactPerson?.trim() ? `איש קשר: ${input.contactPerson.trim()}` : null,
    input.salesperson?.trim() ? `איש מכירות: ${input.salesperson.trim()}` : null,
    input.eventTypeLabel?.trim() ? `פעילות קודמת: ${input.eventTypeLabel.trim()}` : null,
    formattedRevenue ? `סכום מוערך: ${formattedRevenue}` : null,
    "נוצר מיומן המכירות של Gestelit",
  ].filter(Boolean).join("\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `פולואפ עם ${customerName}`,
    dates: `${startDate}/${endDate}`,
    details,
    ctz: "Asia/Jerusalem",
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
