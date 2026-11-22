"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Play, RefreshCw, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  WorkflowAgentConfig,
  WorkflowAgentResult,
} from "@/lib/workflows/agent";
type AgentStep = {
  id: string;
  position: number;
  agent_config: WorkflowAgentConfig;
  stations: { name: string; code: string };
  job_items: {
    id: string;
    name: string;
    planned_quantity: number;
    jobs: { job_number: string; customer_name: string | null };
  };
};
type AgentRun = {
  id: string;
  job_item_step_id: string;
  status: string;
  result: WorkflowAgentResult | null;
  created_at: string;
  reviewed_at?: string | null;
};
const statuses: Record<string, string> = {
  running: "בהרצה",
  pending_review: "ממתין לבדיקת מנהל",
  approved: "אושר על ידי מנהל",
  rejected: "נדחה על ידי מנהל",
  failed: "ההרצה נכשלה",
};
export function WorkflowAgentRuns({ refreshKey }: { refreshKey?: unknown }) {
  const [steps, setSteps] = useState<AgentStep[]>([]),
    [runs, setRuns] = useState<AgentRun[]>([]);
  const [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const requestRef = useRef<{ step: string; id: string } | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/workflows/agents", {
        credentials: "include",
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setSteps(data.steps);
      setRuns(data.runs);
      setSelected((current) =>
        data.steps.some((s: AgentStep) => s.id === current)
          ? current
          : (data.steps[0]?.id ?? ""),
      );
    } catch {
      setError("לא ניתן לטעון את הסוכנים. נסו לרענן.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, refreshKey]);
  const step = steps.find((s) => s.id === selected);
  const handleRun = async () => {
    if (!step || busy) return;
    setBusy(true);
    setError("");
    if (requestRef.current?.step !== step.id)
      requestRef.current = { step: step.id, id: crypto.randomUUID() };
    try {
      const response = await fetch("/api/admin/workflows/agents/runs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stepId: step.id,
          requestId: requestRef.current.id,
        }),
      });
      if (!response.ok) {
        if (response.status !== 409) requestRef.current = null;
        throw new Error();
      }
      const { run } = await response.json();
      if (run.status !== "running") requestRef.current = null;
      await load();
    } catch {
      setError(
        "ההרצה לא הושלמה. רעננו כדי לבדוק אם נשמרה תוצאה לפני ניסיון נוסף.",
      );
    } finally {
      setBusy(false);
    }
  };
  const review = async (id: string, status: "approved" | "rejected") => {
    setBusy(true);
    setReviewing(true);
    setError("");
    try {
      const response = await fetch("/api/admin/workflows/agents/runs", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!response.ok) throw new Error();
      await load();
    } catch {
      setError("לא ניתן לעדכן את הבדיקה. רעננו ובדקו את מצב התוצאה.");
    } finally {
      setBusy(false);
      setReviewing(false);
    }
  };
  return (
    <section
      className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6"
      aria-label="הרצות סוכנים בעבודות"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Bot className="h-5 w-5 text-violet-500" />
            סוכנים בעבודות
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            הריצו סוכן על מוצר שנוצר ובדקו את המלצותיו. מוצגים עד 100 שלבים
            אחרונים במוצרים פעילים.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void load()}
          disabled={busy || loading}
          aria-label="רענון סוכנים"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          טוען סוכנים…
        </p>
      ) : !steps.length ? (
        <p className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
          הגדירו סוכן בתחנה, שמרו את התהליך וצרו מוצר מהתבנית. הסוכן של המוצר
          יופיע כאן.
        </p>
      ) : (
        <>
          <label className="block space-y-2 text-sm">
            <span>עבודה, מוצר ותחנה להרצה</span>
            <select
              className="h-11 w-full rounded-md border border-input bg-background px-3"
              value={selected}
              disabled={busy}
              onChange={(e) => {
                setSelected(e.target.value);
                requestRef.current = null;
              }}
            >
              <option value="" disabled>
                בחרו שלב בעבודה
              </option>
              {steps.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.job_items.jobs.job_number} · {s.job_items.name} ·{" "}
                  {s.stations.name}
                </option>
              ))}
            </select>
          </label>
          {step && (
            <div className="grid gap-4 lg:grid-cols-[minmax(200px,1fr)_2fr]">
              <div className="space-y-3 rounded-lg bg-muted/40 p-4">
                <h4 className="font-medium">{step.agent_config.name}</h4>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {step.agent_config.instructions}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  מקורות: פרטי תחנה
                  {step.agent_config.includeJobContext
                    ? ", פרטי עבודה ומוצר"
                    : ""}
                  {step.agent_config.includeProgress
                    ? ", דיווחי כמויות בתחנה"
                    : ""}
                  . ההגדרות הועתקו בעת יצירת המוצר.
                </p>
                <Button
                  type="button"
                  onClick={() => void handleRun()}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="ml-2 h-4 w-4" />
                  )}
                  {busy
                    ? reviewing
                      ? "שומר בדיקה…"
                      : "מכין תוצאה…"
                    : "הרצת סוכן"}
                </Button>
                {busy && (
                  <p role="status" className="text-xs text-primary">
                    {reviewing
                      ? "שומר את החלטת המנהל…"
                      : "הסוכן קורא את המידע המותר ומכין המלצה לבדיקה…"}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  התוצאה תישמר לבדיקה. אישור המלצה אינו משנה את מצב הייצור.
                </p>
              </div>
              <div className="space-y-3" aria-live="polite">
                {runs
                  .filter((r) => r.job_item_step_id === selected)
                  .slice(0, 5)
                  .map((run) => (
                    <article
                      key={run.id}
                      className="space-y-3 rounded-lg border border-border p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="text-sm text-primary">
                          {statuses[run.status] ?? run.status}
                        </strong>
                        <time className="text-xs text-muted-foreground">
                          {new Date(run.created_at).toLocaleString("he-IL")}
                        </time>
                      </div>
                      {run.result && (
                        <>
                          <p className="text-sm leading-relaxed">
                            {run.result.summary}
                          </p>
                          <ul className="list-inside list-disc space-y-2 text-sm">
                            {run.result.items.map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                          {run.result.warnings.length > 0 && (
                            <div className="rounded-md bg-amber-500/10 p-3">
                              <p className="mb-2 text-xs font-semibold">
                                חוסרים ונקודות לבדיקה
                              </p>
                              <ul className="list-inside list-disc space-y-1 text-sm">
                                {run.result.warnings.map((w, i) => (
                                  <li key={i}>{w}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      )}
                      {run.status === "pending_review" && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy}
                            onClick={() => void review(run.id, "approved")}
                          >
                            <Check className="ml-2 h-4 w-4" />
                            אישור ההמלצה
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void review(run.id, "rejected")}
                          >
                            <X className="ml-2 h-4 w-4" />
                            דחיית ההמלצה
                          </Button>
                        </div>
                      )}
                      {run.status === "running" && (
                        <p className="text-xs text-muted-foreground">
                          הבקשה התקבלה. רעננו לקבלת התוצאה; הרצה שנותרה כך עשויה
                          להצריך ניסיון חדש.
                        </p>
                      )}
                    </article>
                  ))}
                {!runs.some((r) => r.job_item_step_id === selected) && (
                  <p className="p-4 text-sm text-muted-foreground">
                    עדיין לא הורץ הסוכן על מוצר זה.
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
