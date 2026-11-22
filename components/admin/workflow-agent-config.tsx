"use client";
import { Bot, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  defaultWorkflowAgent,
  type WorkflowAgentConfig,
} from "@/lib/workflows/agent";
export function WorkflowAgentSetup({
  stationName,
  value,
  onChange,
  disabled,
}: {
  stationName: string;
  value?: WorkflowAgentConfig | null;
  onChange: (value: WorkflowAgentConfig | null) => void;
  disabled?: boolean;
}) {
  return (
    <section
      aria-label={`סוכן AI בתחנה ${stationName}`}
      className="space-y-4 rounded-xl border border-violet-500/25 bg-violet-500/[0.04] p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 font-semibold">
            <Bot className="h-5 w-5 text-violet-500" />
            סוכן AI · {stationName}
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            עוזר ייעודי שמכין תדריך, בדיקות או סקירת סיכונים לעבודה בתחנה.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange(value ? null : defaultWorkflowAgent())}
        >
          {value ? "הסרת הסוכן" : "הוספת סוכן AI"}
        </Button>
      </div>
      {value && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span>שם הסוכן</span>
              <Input
                value={value.name}
                maxLength={100}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, name: e.target.value })}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span>התוצר שהסוכן מכין</span>
              <select
                value={value.output}
                disabled={disabled}
                onChange={(e) =>
                  onChange({
                    ...value,
                    output: e.target.value as WorkflowAgentConfig["output"],
                  })
                }
                className="block h-10 w-full rounded-md border border-input bg-background px-3"
              >
                <option value="checklist">רשימת בדיקות</option>
                <option value="handoff">תדריך לעובד</option>
                <option value="risks">סקירת סיכונים וחוסרים</option>
              </select>
            </label>
          </div>
          <label className="block space-y-2 text-sm">
            <span>הוראות לסוכן</span>
            <Textarea
              value={value.instructions}
              rows={3}
              maxLength={3000}
              disabled={disabled}
              onChange={(e) =>
                onChange({ ...value, instructions: e.target.value })
              }
            />
          </label>
          <fieldset className="space-y-2 text-sm">
            <legend className="mb-2 font-medium">מידע שהסוכן רשאי לקרוא</legend>
            <p className="text-xs text-muted-foreground">
              פרטי התחנה והמיקום ברצף כלולים תמיד. סמנו מידע נוסף:
            </p>
            <label className="flex min-h-10 items-center gap-2">
              <input
                type="checkbox"
                checked={value.includeJobContext}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ ...value, includeJobContext: e.target.checked })
                }
              />
              פרטי העבודה והמוצר, כמות מתוכננת ותאריך יעד
            </label>
            <label className="flex min-h-10 items-center gap-2">
              <input
                type="checkbox"
                checked={value.includeProgress}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ ...value, includeProgress: e.target.checked })
                }
              />
              כמויות תקינות ופסולות שדווחו בתחנה
            </label>
          </fieldset>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            הרצה ידנית על מוצר שנוצר, עם אישור מנהל לתוצאה. הסוכן אינו משנה
            כמויות, סטטוס ייצור או אישורי איכות. ההגדרה נשמרת יחד עם התהליך.
          </p>
        </>
      )}
    </section>
  );
}
