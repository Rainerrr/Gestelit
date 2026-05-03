import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

const BINA_TABLES = {
  DFHazmRashi: "bina_dfhazmrashi",
  DFHazmMontage: "bina_dfhazmmontage",
  DFHazmNigrar: "bina_dfhazmnigrar",
  DFHazmGimur: "bina_dfhazmgimur",
  DFHazmGrafika: "bina_dfhazmgrafika",
  DFHazmKtiva: "bina_dfhazmktiva",
  DFHazmKedam: "bina_dfhazmkedam",
  DFHazmGlyonot: "bina_dfhazmglyonot",
  Mismahim: "bina_mismahim",
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
}

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

export async function POST(request: Request) {
  const syncKey = request.headers.get("X-Sync-Key");

  if (!syncKey || syncKey !== process.env.BINA_SYNC_KEY) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const payload = validatePayload(body);
  if (!payload) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const supabase = createServiceSupabase();
  const results: Record<
    string,
    { upserted: number; error?: string }
  > = {};

  for (const [tableName, rows] of Object.entries(payload.tables)) {
    if (!Array.isArray(rows) || rows.length === 0) {
      results[tableName] = { upserted: 0 };
      continue;
    }

    const supabaseTable = BINA_TABLES[tableName as BinaTableName];

    const { error } = await supabase
      .from(supabaseTable)
      .upsert(rows, {
        onConflict: "bina_id",
        ignoreDuplicates: false,
      });

    if (error) {
      results[tableName] = { upserted: 0, error: error.message };
    } else {
      results[tableName] = { upserted: rows.length };
    }
  }

  // Log sync event
  const { error: logError } = await supabase.from("bina_sync_log").insert({
    synced_at: payload.synced_at,
    results,
  });

  if (logError) {
    return NextResponse.json(
      { error: "SYNC_LOG_FAILED", details: logError.message, results },
      { status: 500 },
    );
  }

  const hasUpsertErrors = Object.values(results).some((result) => result.error);
  return NextResponse.json(
    { ok: !hasUpsertErrors, results },
    { status: hasUpsertErrors ? 207 : 200 },
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
