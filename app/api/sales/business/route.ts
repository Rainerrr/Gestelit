import { NextResponse } from "next/server";
import { requireSalesScope } from "@/lib/auth/sales-session";
import { runSalesBusinessQuery } from "@/lib/ai/query/sales-execute";
import ExcelJS from "exceljs";
import { compactDate } from "@/lib/calendar";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await requireSalesScope("sales_personal_view");
    const p = new URL(request.url).searchParams;
    const scope =
      p.get("scope") === "team" && user.scopes.includes("sales_team_view")
        ? "team"
        : "personal";
    const kind =
      p.get("kind") === "invoices"
        ? "invoices"
        : p.get("kind") === "ranking"
          ? "ranking"
          : "orders";
    const from = p.get("from") || "2024-11-01";
    const to = p.get("to") || new Date().toISOString().slice(0, 10);
    if (!compactDate(from) || !compactDate(to) || from > to)
      return NextResponse.json(
        { error: "INVALID_DATE_RANGE" },
        { status: 400 },
      );
    const filters: Array<{ column: string; op: string; value: string }> = [
      {
        column: kind === "orders" ? "received_at" : "invoice_at",
        op: "gte",
        value: from,
      },
      {
        column: kind === "orders" ? "received_at" : "invoice_at",
        op: "lt",
        value: new Date(Date.parse(to) + 86400000).toISOString(),
      },
    ];
    for (const [key, column] of [
      ["search", "customer_name"],
      ["area", "area"],
      ["group", "customer_group"],
    ]) {
      const value = p.get(key)?.trim();
      if (value)
        filters.push({ column, op: "contains", value: value.slice(0, 150) });
    }
    const plan =
      kind === "orders"
        ? {
            dataset: "sales_orders",
            columns: [
              "work_order_id",
              "customer_name",
              "title",
              "received_at",
              "due_at",
              "status_text",
              "quantity",
              "account_manager",
            ],
            filters,
            orderBy: { column: "received_at", direction: "desc" },
            limit: 200,
          }
        : kind === "invoices"
          ? {
              dataset: "sales_invoices",
              columns: [
                "invoice_no",
                "work_year",
                "customer_name",
                "invoice_at",
                "total_amount",
                "currency",
                "account_manager",
              ],
              filters,
              orderBy: { column: "invoice_at", direction: "desc" },
              limit: 200,
            }
          : {
              dataset: "sales_invoices",
              groupBy: ["customer_name", "customer_code", "currency"],
              measures: [
                { op: "sum", column: "total_amount" },
                { op: "count" },
              ],
              filters,
              orderBy: { column: "m0", direction: "desc" },
              limit: 200,
            };
    const result = await runSalesBusinessQuery(
      plan,
      { id: user.id, scope },
      request.signal,
    );
    const columns =
      kind === "orders"
        ? [
            ["work_order_id", "פקע"],
            ["customer_name", "לקוח"],
            ["title", "תיאור"],
            ["received_at", "תאריך קבלה"],
            ["due_at", "אספקה"],
            ["status_text", "סטטוס BINA"],
            ["quantity", "כמות"],
            ["account_manager", "מנהל לקוח"],
          ]
        : kind === "invoices"
          ? [
              ["invoice_no", "חשבונית"],
              ["work_year", "שנה"],
              ["customer_name", "לקוח"],
              ["invoice_at", "תאריך"],
              ["total_amount", "סכום חשבונית"],
              ["currency", "מטבע מקור"],
              ["account_manager", "מנהל לקוח"],
            ]
          : [
              ["customer_name", "לקוח"],
              ["customer_code", "קוד"],
              ["currency", "מטבע מקור"],
              ["m0", "סכום חשבוניות"],
              ["m1", "מספר חשבוניות"],
            ];
    const coverage = {
      from,
      to,
      scope,
      quotesAvailable: false,
      note: "פקודות ייצור, חשבוניות והצעות מחיר הם מסמכים נפרדים. מטבע חסר מוצג כלא ידוע. הדירוג הוא לפי סכום חשבוניות, לא רווח או יתרת חוב.",
    };
    if (p.get("export") === "xlsx") {
      if (!user.scopes.includes("sales_export"))
        return NextResponse.json({ error: "SALES_FORBIDDEN" }, { status: 403 });
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet("דוח BINA", {
        views: [{ rightToLeft: true }],
      });
      sheet.addRow([coverage.note]);
      sheet.addRow([
        from,
        to,
        result.sourceTruncated ? "מדגם מקור מוגבל" : "כל רשומות המקור התואמות",
        result.outputTruncated ? "תוצאה מוגבלת ל-200 שורות" : "",
      ]);
      sheet.addRow(columns.map((c) => c[1]));
      for (const row of result.rows as Record<string, unknown>[])
        sheet.addRow(columns.map((c) => row[c[0]] ?? ""));
      sheet.columns.forEach((c) => (c.width = 24));
      return new Response(new Uint8Array(await book.xlsx.writeBuffer()), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename=gestelit-${kind}.xlsx`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json({
      ...result,
      columns,
      coverage,
      canViewTeam: user.scopes.includes("sales_team_view"),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "FAILED";
    return NextResponse.json(
      { error: code.startsWith("SALES_") ? code : "SALES_BUSINESS_FAILED" },
      {
        status:
          code === "SALES_UNAUTHORIZED"
            ? 401
            : code === "SALES_FORBIDDEN"
              ? 403
              : 500,
      },
    );
  }
}
