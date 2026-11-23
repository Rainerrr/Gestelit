"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAssistantScreenContext } from "@/components/ai/use-assistant-screen-context";
type Result = {
  rows: Record<string, unknown>[];
  columns: string[][];
  sourceTruncated: boolean;
  outputTruncated: boolean;
  scannedRows: number;
  freshness: string | null;
  canViewTeam: boolean;
};
export default function SalesBusinessPage() {
  const [kind, setKind] = useState("orders"),
    [from, setFrom] = useState("2024-11-01"),
    [to, setTo] = useState(new Date().toISOString().slice(0, 10)),
    [search, setSearch] = useState(""),
    [area, setArea] = useState(""),
    [group, setGroup] = useState(""),
    [scope, setScope] = useState("personal");
  const [result, setResult] = useState<Result | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const query = new URLSearchParams({
    kind,
    from,
    to,
    search,
    area,
    group,
    scope,
  }).toString();
  useAssistantScreenContext({
    filters: {
      dateFrom: from,
      dateTo: to,
      client: search,
      area,
      customerGroup: group,
    },
    selectedEntity: { report: kind },
  });
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setBusy(true);
      setError("");
      try {
        const r = await fetch(`/api/sales/business?${query}`, { signal });
        if (!r.ok) throw Error();
        setResult(await r.json());
      } catch {
        if (!signal?.aborted)
          setError("לא הצלחנו לטעון את הדוח. בדקו את טווח התאריכים ונסו שוב.");
      } finally {
        if (!signal?.aborted) setBusy(false);
      }
    },
    [query],
  );
  useEffect(() => {
    const c = new AbortController();
    const t = setTimeout(() => void load(c.signal), 250);
    return () => {
      clearTimeout(t);
      c.abort();
    };
  }, [load]);
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 pb-28 md:p-8" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">הלקוחות המשויכים אליי</p>
          <h1 className="mt-2 text-3xl font-bold">מסמכי BINA ודירוג לקוחות</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void load()}>
            רענון
          </Button>
          <Button asChild variant="outline">
            <a href={`/api/sales/business?${query}&export=xlsx`}>
              ייצוא הדוח ל-Excel
            </a>
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          ["orders", "פקודות ייצור נכנסות"],
          ["invoices", "חשבוניות"],
          ["ranking", "דירוג לפי חשבוניות"],
        ].map(([id, label]) => (
          <Button
            key={id}
            variant={kind === id ? "default" : "outline"}
            onClick={() => setKind(id)}
          >
            {label}
          </Button>
        ))}
      </div>
      <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm">
          מתאריך
          <Input
            type="date"
            dir="ltr"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-sm">
          עד תאריך
          <Input
            type="date"
            dir="ltr"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="text-sm">
          לקוח
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש בשם הלקוח"
          />
        </label>
        <label className="text-sm">
          מיקום
          <Input value={area} onChange={(e) => setArea(e.target.value)} />
        </label>
        <label className="text-sm">
          מאפיין לקוח
          <Input value={group} onChange={(e) => setGroup(e.target.value)} />
        </label>
        {result?.canViewTeam && (
          <label className="text-sm">
            היקף הדוח
            <select
              className="mt-1 h-10 w-full rounded border bg-background px-3"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="personal">הלקוחות שלי</option>
              <option value="team">כל הצוות</option>
            </select>
          </label>
        )}
      </Card>
      <p className="text-sm text-muted-foreground">
        פקודות ייצור אינן הצעות מחיר. סכומי החשבוניות מוצגים לפי מטבע המקור;
        מטבע שלא הוגדר נשאר לא ידוע.
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {busy && <p role="status">טוען נתונים…</p>}
      {result && !busy && (
        <>
          <p className="text-sm">
            {result.rows.length.toLocaleString("he-IL")} שורות תוצאה ·{" "}
            {result.scannedRows.toLocaleString("he-IL")} רשומות מקור תואמות{" "}
            {result.sourceTruncated && "· מדגם מקור מוגבל — הדירוג אינו מלא"}{" "}
            {result.outputTruncated &&
              "· מוצגות 200 תוצאות בלבד; צמצמו את הסינון"}
          </p>
          <Card className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {result.columns.map(([key, label]) => (
                    <th className="whitespace-nowrap p-3" key={key}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    {result.columns.map(([key]) => (
                      <td key={key} className="p-3">
                        {row[key] == null ? (
                          "—"
                        ) : key.endsWith("_at") ? (
                          <bdi>
                            {new Date(String(row[key])).toLocaleDateString(
                              "he-IL",
                            )}
                          </bdi>
                        ) : typeof row[key] === "number" ? (
                          <bdi>
                            {row[key].toLocaleString("he-IL", {
                              maximumFractionDigits: 2,
                            })}
                          </bdi>
                        ) : row[key] === "UNKNOWN" ? (
                          "לא ידוע"
                        ) : (
                          String(row[key])
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!result.rows.length && (
              <p className="p-8 text-center text-muted-foreground">
                לא נמצאו מסמכים ללקוחות המשויכים בטווח שנבחר.
              </p>
            )}
          </Card>
        </>
      )}
    </main>
  );
}
