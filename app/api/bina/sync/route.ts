import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

const BINA_TABLES = {
  DFHazmRashi: "bina_dfhazmrashi",
  DFHazmMontage: "bina_dfhazmmontage",
  DFHazmNigrar: "bina_dfhazmnigrar",
  DFHazmGimur: "bina_dfhazmgimur",
  DFHazmGrafika: "bina_dfhazmgrafika",
  DFHazmKirkia: "bina_dfhazmkirkia",
  DFHazmKedam: "bina_dfhazmkedam",
  DFHazmGlyonot: "bina_dfhazmglyonot",
  DFMlay: "bina_dfmlay",
  TnuotMlay: "bina_tnuotmlay",
  Mismahim: "bina_mismahim",
  HeshSapakRashi: "bina_heshsapakrashi",
  HeshSapakNigrar: "bina_heshsapaknigrar",
  TMSapakNigrar: "bina_tmsapaknigrar",
  BakashaNigrar: "bina_bakashanigrar",
  Hovot: "bina_hovot",
  DFShelita: "bina_dfshelita",
  HeshbonitRashi: "bina_heshbonitrashi",
  HeshbonitNigrar: "bina_heshbonitnigrar",
  MishloahRashi: "bina_mishloahrashi",
  MishloahNigrar: "bina_mishloahnigrar",
  TovinRashi: "bina_tovinrashi",
  TovinNigrar: "bina_tovinnigrar",
  SqlLogins: "bina_sqllogins",
} as const;

type BinaTableName = keyof typeof BINA_TABLES;

interface BinaRow {
  bina_id: string;
  data: Record<string, unknown>;
  source_updated_at?: string | null;
}

interface BinaSyncPayload {
  synced_at: string;
  tables: Partial<Record<BinaTableName, BinaRow[]>>;
  sync_mode?: string;
  extractor_version?: string;
  max_recent_orders?: number;
  start_at_table?: string;
  metadata?: Record<string, unknown>;
}

type SyncRunInsert = {
  source_synced_at: string;
  status: "running";
  sync_mode: string;
  extractor_version: string | null;
  max_recent_orders: number | null;
  start_at_table: string | null;
  table_count: number;
  sent_count: number;
  metadata: Record<string, unknown>;
};

type SyncRunUpdate = {
  finished_at: string;
  status: "success" | "partial_error" | "error";
  table_count: number;
  sent_count: number;
  upserted_count: number;
  failed_count: number;
  error?: string | null;
};

type SyncTableRunInsert = {
  run_id: string;
  source_table: string;
  storage_table: string;
  status: "success" | "skipped" | "error";
  sent_count: number;
  upserted_count: number;
  failed_count: number;
  source_min_key: string | null;
  source_max_key: string | null;
  source_min_date: string | null;
  source_max_date: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBinaTableName(value: string): value is BinaTableName {
  return Object.prototype.hasOwnProperty.call(BINA_TABLES, value);
}

function validatePayload(body: unknown): BinaSyncPayload | null {
  if (!isRecord(body) || typeof body.synced_at !== "string") {
    return null;
  }

  if (!isRecord(body.tables)) {
    return null;
  }

  for (const [tableName, rows] of Object.entries(body.tables)) {
    if (!isBinaTableName(tableName) || !Array.isArray(rows)) {
      return null;
    }

    for (const row of rows) {
      if (
        !isRecord(row) ||
        typeof row.bina_id !== "string" ||
        !row.bina_id ||
        !isRecord(row.data)
      ) {
        return null;
      }
    }
  }

  return body as unknown as BinaSyncPayload;
}

function safeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizePayload(body: BinaSyncPayload): BinaSyncPayload {
  return {
    ...body,
    sync_mode: safeOptionalString((body as unknown as Record<string, unknown>).sync_mode),
    extractor_version: safeOptionalString((body as unknown as Record<string, unknown>).extractor_version),
    max_recent_orders: safeOptionalNumber((body as unknown as Record<string, unknown>).max_recent_orders),
    start_at_table: safeOptionalString((body as unknown as Record<string, unknown>).start_at_table),
    metadata: isRecord((body as unknown as Record<string, unknown>).metadata)
      ? ((body as unknown as Record<string, unknown>).metadata as Record<string, unknown>)
      : {},
  };
}

function summarizeRows(rows: BinaRow[]) {
  const keys = rows.map((row) => row.bina_id).filter(Boolean).sort((a, b) => a.localeCompare(b, "en"));
  const dates = rows
    .map((row) => row.source_updated_at)
    .filter((value): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value)))
    .sort();

  return {
    source_min_key: keys[0] ?? null,
    source_max_key: keys[keys.length - 1] ?? null,
    source_min_date: dates[0] ?? null,
    source_max_date: dates[dates.length - 1] ?? null,
  };
}

async function insertSyncRun(
  supabase: ReturnType<typeof createServiceSupabase>,
  payload: BinaSyncPayload,
) {
  const tableEntries = Object.entries(payload.tables).filter(([, rows]) => Array.isArray(rows));
  const sentCount = tableEntries.reduce((sum, [, rows]) => sum + (rows?.length ?? 0), 0);
  const insertPayload: SyncRunInsert = {
    source_synced_at: payload.synced_at,
    status: "running",
    sync_mode: payload.sync_mode ?? "recent_window",
    extractor_version: payload.extractor_version ?? null,
    max_recent_orders: payload.max_recent_orders ?? null,
    start_at_table: payload.start_at_table ?? null,
    table_count: tableEntries.length,
    sent_count: sentCount,
    metadata: payload.metadata ?? {},
  };

  const { data, error } = await supabase
    .from("bina_sync_runs")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error || !data?.id) {
    console.warn("BINA sync observability run insert failed", error?.message);
    return null;
  }

  return data.id as string;
}

async function insertSyncTableRun(
  supabase: ReturnType<typeof createServiceSupabase>,
  runId: string | null,
  row: Omit<SyncTableRunInsert, "run_id">,
) {
  if (!runId) return;
  const { error } = await supabase.from("bina_sync_table_runs").insert({
    run_id: runId,
    ...row,
  } satisfies SyncTableRunInsert);
  if (error) {
    console.warn("BINA sync observability table insert failed", error.message);
  }
}

async function finishSyncRun(
  supabase: ReturnType<typeof createServiceSupabase>,
  runId: string | null,
  update: SyncRunUpdate,
) {
  if (!runId) return;
  const { error } = await supabase
    .from("bina_sync_runs")
    .update(update)
    .eq("id", runId);
  if (error) {
    console.warn("BINA sync observability run update failed", error.message);
  }
}

export async function POST(request: Request) {
  const syncKey = request.headers.get("X-Sync-Key");

  if (!syncKey || syncKey !== process.env.BINA_SYNC_KEY) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validatedPayload = validatePayload(body);
  if (!validatedPayload) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }
  const payload = normalizePayload(validatedPayload);

  const supabase = createServiceSupabase();
  const runId = await insertSyncRun(supabase, payload);
  const results: Record<
    string,
    { upserted: number; error?: string }
  > = {};
  let sentCount = 0;
  let upsertedCount = 0;
  let failedCount = 0;

  for (const [tableName, rows] of Object.entries(payload.tables)) {
    const supabaseTable = BINA_TABLES[tableName as BinaTableName];

    if (!Array.isArray(rows) || rows.length === 0) {
      results[tableName] = { upserted: 0 };
      await insertSyncTableRun(supabase, runId, {
        source_table: tableName,
        storage_table: supabaseTable,
        status: "skipped",
        sent_count: 0,
        upserted_count: 0,
        failed_count: 0,
        source_min_key: null,
        source_max_key: null,
        source_min_date: null,
        source_max_date: null,
        error: null,
        metadata: {},
      });
      continue;
    }

    sentCount += rows.length;
    const rowSummary = summarizeRows(rows);

    const { error } = await supabase
      .from(supabaseTable)
      .upsert(rows, {
        onConflict: "bina_id",
        ignoreDuplicates: false,
      });

    if (error) {
      results[tableName] = { upserted: 0, error: error.message };
      failedCount += rows.length;
      await insertSyncTableRun(supabase, runId, {
        source_table: tableName,
        storage_table: supabaseTable,
        status: "error",
        sent_count: rows.length,
        upserted_count: 0,
        failed_count: rows.length,
        ...rowSummary,
        error: error.message,
        metadata: {},
      });
    } else {
      results[tableName] = { upserted: rows.length };
      upsertedCount += rows.length;
      await insertSyncTableRun(supabase, runId, {
        source_table: tableName,
        storage_table: supabaseTable,
        status: "success",
        sent_count: rows.length,
        upserted_count: rows.length,
        failed_count: 0,
        ...rowSummary,
        error: null,
        metadata: {},
      });
    }
  }

  const hasUpsertErrors = Object.values(results).some((result) => result.error);
  if (hasUpsertErrors) {
    await finishSyncRun(supabase, runId, {
      finished_at: new Date().toISOString(),
      status: "partial_error",
      table_count: Object.keys(payload.tables).length,
      sent_count: sentCount,
      upserted_count: upsertedCount,
      failed_count: failedCount,
      error: "BINA_PARTIAL_SYNC_REJECTED",
    });
    return NextResponse.json(
      { ok: false, error: "BINA_PARTIAL_SYNC_REJECTED", results },
      { status: 500 },
    );
  }

  // Log sync event
  const { error: logError } = await supabase.from("bina_sync_log").insert({
    synced_at: payload.synced_at,
    results,
  });

  if (logError) {
    await finishSyncRun(supabase, runId, {
      finished_at: new Date().toISOString(),
      status: "error",
      table_count: Object.keys(payload.tables).length,
      sent_count: sentCount,
      upserted_count: upsertedCount,
      failed_count: failedCount,
      error: "SYNC_LOG_FAILED",
    });
    return NextResponse.json(
      { error: "SYNC_LOG_FAILED", details: logError.message, results },
      { status: 500 },
    );
  }

  await finishSyncRun(supabase, runId, {
    finished_at: new Date().toISOString(),
    status: "success",
    table_count: Object.keys(payload.tables).length,
    sent_count: sentCount,
    upserted_count: upsertedCount,
    failed_count: failedCount,
    error: null,
  });

  return NextResponse.json(
    { ok: true, results },
    { status: 200 },
  );
}

export async function GET(request: Request) {
  const syncKey = request.headers.get("X-Sync-Key");
  if (!syncKey || syncKey !== process.env.BINA_SYNC_KEY) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const supabase = createServiceSupabase();
  const { data } = await supabase
    .from("bina_sync_log")
    .select("*")
    .order("synced_at", { ascending: false })
    .limit(10);

  return NextResponse.json({ last_syncs: data });
}
