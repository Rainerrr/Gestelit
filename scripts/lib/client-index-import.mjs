const HEADER_MAP = {
  customer_code: "קוד",
  customer_name: "שם לקוח",
  customer_group: "קבוצה",
  status: "מצב",
  bookkeeping_no: "מס הנהח",
  salesperson: "נציג מכירות",
  opened_at: "תאריך פתיחה",
};

export function normalizeClientIndexText(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized || null;
}

export function normalizeClientCode(value) {
  const text = normalizeClientIndexText(value);
  if (!text || !/^\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

export function normalizeClientIndexDate(value) {
  const text = normalizeClientIndexText(value);
  if (!text) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) {
    const [, year, month, day] = iso;
    return validDate(Number(year), Number(month), Number(day));
  }

  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text);
  if (!us) return null;
  const [, month, day, rawYear] = us;
  const parsedYear = Number(rawYear);
  const year = rawYear.length === 2 ? (parsedYear >= 70 ? 1900 + parsedYear : 2000 + parsedYear) : parsedYear;
  return validDate(year, Number(month), Number(day));
}

function validDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return date.toISOString().slice(0, 10);
}

export function normalizeClientIndexRow(row, source) {
  const customerCode = normalizeClientCode(row[HEADER_MAP.customer_code]);
  const customerName = normalizeClientIndexText(row[HEADER_MAP.customer_name]);
  if (customerCode === null || !customerName) return null;

  return {
    customer_code: customerCode,
    customer_name: customerName,
    customer_group: normalizeClientIndexText(row[HEADER_MAP.customer_group]),
    status: normalizeClientIndexText(row[HEADER_MAP.status]),
    bookkeeping_no: normalizeClientIndexText(row[HEADER_MAP.bookkeeping_no]),
    salesperson: normalizeClientIndexText(row[HEADER_MAP.salesperson]),
    opened_at: normalizeClientIndexDate(row[HEADER_MAP.opened_at]),
    source_filename: source.filename,
    source_updated_at: source.updatedAt,
    imported_at: source.importedAt,
  };
}

export function normalizeClientIndexRows(rows, source) {
  const byCode = new Map();
  let skipped = 0;
  for (const row of rows) {
    const normalized = normalizeClientIndexRow(row, source);
    if (!normalized) {
      skipped += 1;
      continue;
    }
    byCode.set(normalized.customer_code, normalized);
  }
  return {
    rows: Array.from(byCode.values()),
    skipped,
    duplicates: rows.length - skipped - byCode.size,
  };
}
