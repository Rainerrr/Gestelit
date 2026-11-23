import { NextResponse } from "next/server";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";
import { createServiceSupabase } from "@/lib/supabase/client";
import {
  fetchProcurementAnalysis,
  validateOperationTask,
  validateSupplierCapability,
} from "@/lib/data/operations";
import ExcelJS from "exceljs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (e) {
    return createErrorResponse(e);
  }
  try {
    const p = new URL(request.url).searchParams,
      db = createServiceSupabase();
    if (p.get("view") === "procurement") {
      const data = await fetchProcurementAnalysis({
        from: p.get("from") ?? undefined,
        to: p.get("to") ?? undefined,
        search: p.get("search") ?? undefined,
      });
      if (p.get("export") === "xlsx") {
        const book = new ExcelJS.Workbook();
        for (const [name, key] of [
          ["רכש רבעוני", "quarters"],
          ["ספקים", "suppliers"],
          ["בסיס תכנון", "forecast"],
        ]) {
          const sheet = book.addWorksheet(name, {
            views: [{ rightToLeft: true }],
          });
          sheet.addRow([
            data.from,
            data.to,
            "מקור: שורות חשבוניות ספק; ללא איחוד מטבעות או יחידות. תחזית בסיס אינה המלצת הזמנה.",
          ]);
          const rows = data[key] as Record<string, unknown>[];
          const keys = Object.keys(rows[0] ?? {});
          sheet.addRow(keys);
          for (const row of rows) sheet.addRow(keys.map((k) => row[k] ?? ""));
          sheet.columns.forEach((c) => (c.width = 24));
        }
        return new Response(new Uint8Array(await book.xlsx.writeBuffer()), {
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition":
              "attachment; filename=gestelit-procurement.xlsx",
            "Cache-Control": "no-store",
          },
        });
      }
      return NextResponse.json(data);
    }
    const [tasks, capabilities, suppliers, workers] = await Promise.all([
      db
        .from("operations_tasks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
      db
        .from("supplier_capabilities")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(500),
      db
        .from("operations_supplier_directory")
        .select("*")
        .order("supplier_name")
        .limit(2000),
      db
        .from("workers")
        .select("full_name")
        .eq("is_active", true)
        .order("full_name"),
    ]);
    if (tasks.error || capabilities.error || suppliers.error || workers.error)
      throw Error("OPERATIONS_UNAVAILABLE");
    return NextResponse.json({
      tasks: tasks.data,
      capabilities: capabilities.data,
      suppliers: suppliers.data,
      workers: workers.data,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "OPERATIONS_FAILED" },
      {
        status:
          e instanceof Error && e.message === "INVALID_DATE_RANGE" ? 400 : 500,
      },
    );
  }
}
export async function POST(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (e) {
    return createErrorResponse(e);
  }
  try {
    const body = await request.json();
    const db = createServiceSupabase();
    if (!body || !["task", "capability"].includes(body.kind))
      throw Error("INVALID_KIND");
    const table =
      body.kind === "task" ? "operations_tasks" : "supplier_capabilities";
    const patch =
      body.kind === "task"
        ? validateOperationTask(body)
        : validateSupplierCapability(body);
    if (body.kind === "capability") {
      const { data, error } = await db
        .from("operations_supplier_directory")
        .select("supplier_code")
        .eq("supplier_code", Number(body.supplier_code))
        .maybeSingle();
      if (error || !data) throw Error("UNKNOWN_SUPPLIER");
    }
    if (body.id) {
      if (
        !/^[0-9a-f-]{36}$/i.test(body.id) ||
        typeof body.updated_at !== "string"
      )
        throw Error("INVALID_VERSION");
      const { data, error } = await db
        .from(table)
        .update(patch)
        .eq("id", body.id)
        .eq("updated_at", body.updated_at)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data)
        return NextResponse.json({ error: "STALE_RECORD" }, { status: 409 });
      return NextResponse.json(data);
    }
    const { data, error } = await db
      .from(table)
      .insert(patch)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    const code = e instanceof Error ? e.message : "OPERATIONS_FAILED";
    return NextResponse.json(
      { error: /^(INVALID_|UNKNOWN_)/.test(code) ? code : "OPERATIONS_FAILED" },
      { status: /^(INVALID_|UNKNOWN_)/.test(code) ? 400 : 500 },
    );
  }
}
