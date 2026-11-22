"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles, ClipboardCheck, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { WorkflowPlan } from "@/lib/workflows/plan";

type Props = {
  stations: { id: string }[];
  flags: Record<string, boolean>;
  context?: string;
  disabled?: boolean;
  onApply: (plan: WorkflowPlan) => void;
};
export const WorkflowAiPanel = ({
  stations,
  flags,
  context = "",
  disabled,
  onApply,
}: Props) => {
  const [open, setOpen] = useState(false),
    [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    plan: WorkflowPlan;
    mode: "draft" | "review";
    fingerprint: string;
  } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const fingerprint = JSON.stringify({
    context,
    steps: stations.map((s) => [s.id, !!flags[s.id]]),
  });
  const currentFingerprint = useRef(fingerprint);
  currentFingerprint.current = fingerprint;
  useEffect(() => () => controller.current?.abort(), []);
  const stale = !!result && result.fingerprint !== fingerprint;
  const handleRequest = async (mode: "draft" | "review") => {
    const brief = [context.slice(0, 900), prompt.trim()]
      .filter(Boolean)
      .join("\n");
    if (!brief && mode === "draft") {
      setError("תארו את המוצר ואת דרישות הייצור כדי לקבל הצעה.");
      return;
    }
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/admin/ai/workflow", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          mode,
          prompt:
            brief ||
            "בדוק את רצף התחנות, נקודות האישור ומה צריך לברר לפני ייצור.",
          steps: stations.map((s) => ({
            stationId: s.id,
            requiresFirstProductApproval: !!flags[s.id],
          })),
        }),
      });
      const data = await response.json();
      if (abort.signal.aborted || controller.current !== abort) return;
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? "הגעתם למגבלת הבקשות. נסו שוב בעוד דקה."
            : response.status === 401
              ? "הכניסה פגה. התחברו מחדש כדי להשתמש בעוזר."
              : "לא ניתן לקבל הצעה כרגע. התהליך שלכם לא השתנה; אפשר לנסות שוב.",
        );
      if (currentFingerprint.current !== fingerprint) {
        setError("התהליך השתנה בזמן הבדיקה. בקשו הצעה מעודכנת.");
        return;
      }
      setResult({ plan: data.plan, mode, fingerprint });
    } catch (e) {
      if (!abort.signal.aborted)
        setError(e instanceof Error ? e.message : "שגיאה בקבלת ההצעה.");
    } finally {
      if (controller.current === abort) setBusy(false);
    }
  };
  return (
    <section
      className="rounded-xl border border-primary/20 bg-primary/[0.03]"
      aria-label="עוזר תכנון תהליך"
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex min-h-12 w-full items-center gap-2 px-4 text-right text-sm font-medium"
        aria-expanded={open}
      >
        <Sparkles className="h-4 w-4 text-primary" />
        עוזר תכנון AI
        <span className="mr-auto text-xs font-normal text-muted-foreground">
          {open ? "סגירה" : "מתיאור מוצר לרצף תחנות"}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-primary/10 p-4">
          <label className="block space-y-2 text-sm">
            <span>מה מייצרים ואילו דרישות יש?</span>
            <Textarea
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setResult(null);
              }}
              maxLength={3000}
              disabled={busy || disabled}
              placeholder="למשל: חוברת עם כריכה, הדפסה, חיתוך ואריזה. נדרש אישור מוצר ראשון לפני ההדפסה."
              rows={3}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void handleRequest("draft")}
              disabled={busy || disabled}
            >
              <Sparkles className="ml-2 h-4 w-4" />
              הצע תהליך
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleRequest("review")}
              disabled={busy || disabled || !stations.length}
            >
              <ClipboardCheck className="ml-2 h-4 w-4" />
              בדוק את התהליך
            </Button>
            {busy && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  controller.current?.abort();
                  setBusy(false);
                }}
              >
                ביטול
              </Button>
            )}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            מבוסס על התחנות הפעילות במערכת. ההצעה דורשת בדיקה מקצועית; היא אינה
            מאמתת קיבולת או זמינות מכונות ואינה שומרת שינויים.
          </p>
          {busy && (
            <p role="status" className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              בונה הצעה לפי תחנות המפעל…
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {result && (
            <div
              className="space-y-3 rounded-lg border border-border bg-card p-4"
              aria-live="polite"
            >
              <div>
                <p className="text-xs text-primary">
                  {result.mode === "draft" ? "טיוטה מוצעת" : "סקירת התהליך"}
                </p>
                <h4 className="mt-1 font-semibold">{result.plan.name}</h4>
                <p className="mt-2 text-sm leading-relaxed">
                  {result.plan.summary}
                </p>
              </div>
              <ol className="space-y-2">
                {result.plan.steps.map((s, i) => (
                  <li key={s.stationId} className="text-sm">
                    <strong>{i + 1}. </strong>
                    {s.reason}
                    {s.requiresFirstProductApproval && (
                      <span className="mr-2 text-xs text-primary">
                        אישור מוצר ראשון
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              {!!result.plan.warnings.length && (
                <div className="rounded-lg bg-amber-500/10 p-3">
                  <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <AlertTriangle className="h-4 w-4" />
                    לפני שמתחילים
                  </p>
                  <ul className="list-inside list-disc space-y-1 text-sm">
                    {result.plan.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {!!result.plan.handoff.length && (
                <div>
                  <p className="mb-2 text-sm font-medium">הצעה לתדריך עובד</p>
                  <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                    {result.plan.handoff.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    ההמלצות אינן נשמרות בהוראות העבודה.
                  </p>
                </div>
              )}
              {stale && (
                <p
                  role="status"
                  className="text-sm text-amber-700 dark:text-amber-300"
                >
                  התהליך השתנה מאז ההצעה. בקשו הצעה מעודכנת.
                </p>
              )}
              {result.mode === "draft" && result.plan.steps.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled || stale}
                  onClick={() => {
                    onApply(result.plan);
                    setResult(null);
                  }}
                >
                  החלף את הרצף בטיוטה המוצעת
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
