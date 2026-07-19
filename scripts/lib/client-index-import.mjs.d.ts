export type ClientIndexSource = {
  filename: string;
  updatedAt: string;
  importedAt: string;
};

export type ClientIndexRecord = {
  customer_code: number;
  customer_name: string;
  customer_group: string | null;
  status: string | null;
  bookkeeping_no: string | null;
  salesperson: string | null;
  opened_at: string | null;
  source_filename: string;
  source_updated_at: string;
  imported_at: string;
};

export function normalizeClientIndexText(value: unknown): string | null;
export function normalizeClientCode(value: unknown): number | null;
export function normalizeClientIndexDate(value: unknown): string | null;
export function normalizeClientIndexRow(row: Record<string, unknown>, source: ClientIndexSource): ClientIndexRecord | null;
export function normalizeClientIndexRows(rows: Array<Record<string, unknown>>, source: ClientIndexSource): {
  rows: ClientIndexRecord[];
  skipped: number;
  duplicates: number;
};
