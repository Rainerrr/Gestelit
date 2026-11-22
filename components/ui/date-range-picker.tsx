"use client";
import { useId, useState } from "react";
import { format, isValid, parse } from "date-fns";
import { CalendarDays, X } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { hebrewDate, hebrewDateRange } from "@/lib/format/hebrew";
import { dateKey, HebrewCalendar } from "./hebrew-calendar";

type DateRangePickerProps = { value?: DateRange; onChange: (range: DateRange | undefined) => void; placeholder?: string; className?: string; allowFutureDates?: boolean };
export function parseCalendarInput(value: string): Date | undefined {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return undefined;
  const date = parse(value, "dd/MM/yyyy", new Date());
  return isValid(date) && format(date, "dd/MM/yyyy") === value ? date : undefined;
}
export function DateRangePicker({ value, onChange, placeholder = "בחרו תקופה", className, allowFutureDates = false }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(value);
  const [month, setMonth] = useState(value?.from ?? new Date());
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const id = useId();
  const today = new Date(); today.setHours(23, 59, 59, 999);
  const from = parseCalendarInput(fromInput), to = parseCalendarInput(toInput);
  const valid = Boolean(from && to && from <= to && (allowFutureDates || to <= today));
  const display = value?.from ? value.to && dateKey(value.from) !== dateKey(value.to) ? hebrewDateRange(dateKey(value.from), dateKey(value.to)) : hebrewDate(dateKey(value.from)) : placeholder;
  const select = (range: DateRange | undefined) => {
    setDraft(range); setFromInput(range?.from ? format(range.from, "dd/MM/yyyy") : ""); setToInput(range?.to ? format(range.to, "dd/MM/yyyy") : "");
  };
  return <Popover open={open} onOpenChange={(next) => { if (next) { select(value); setMonth(value?.from ?? new Date()); } setOpen(next); }}>
    <div dir="rtl" className={cn("inline-flex min-w-0 max-w-full items-center rounded-xl border border-input bg-card", className)}>
      <PopoverTrigger asChild><button type="button" aria-label={`בחירת תקופה: ${display}`} className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-start text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground"/><span>{display}</span></button></PopoverTrigger>
      {value?.from && <button type="button" aria-label="נקה תאריכים" className="me-1 rounded-lg p-2 text-muted-foreground hover:bg-accent" onClick={() => onChange(undefined)}><X className="h-3.5 w-3.5"/></button>}
    </div>
    <PopoverContent dir="rtl" align="start" collisionPadding={12} className="max-h-[min(calc(100dvh-24px),var(--radix-popover-content-available-height))] w-auto max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl p-4">
      <div className="mb-3 grid grid-cols-2 gap-3 border-b pb-3">
        {[{ key: "from", label: "מתאריך", text: fromInput, set: setFromInput }, { key: "to", label: "עד תאריך", text: toInput, set: setToInput }].map((field) => <label key={field.key} htmlFor={`${id}-${field.key}`} className="text-xs text-muted-foreground">{field.label}<input id={`${id}-${field.key}`} aria-describedby={`${id}-format`} dir="ltr" inputMode="numeric" placeholder="DD/MM/YYYY" value={field.text} onChange={(event) => {
          field.set(event.target.value);
          const parsed = parseCalendarInput(event.target.value);
          if (parsed) { setDraft((prev) => ({ from: field.key === "from" ? parsed : prev?.from, to: field.key === "to" ? parsed : prev?.to })); if (field.key === "from") setMonth(parsed); }
        }} className="mt-1 block h-10 w-[134px] max-w-full rounded-lg border bg-background px-2 text-center text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"/></label>)}
      </div>
      <p id={`${id}-format`} className="mb-2 text-xs text-muted-foreground">יום / חודש / שנה · אפשר לבחור גם בלוח</p>
      <HebrewCalendar mode="range" month={month} onMonthChange={setMonth} selected={draft} onSelect={select} disabled={allowFutureDates ? undefined : { after: today }}/>
      {!valid && (fromInput || toInput) && <p role="status" className="mt-3 max-w-[280px] text-xs leading-5 text-muted-foreground">בחרו תאריך התחלה וסיום תקינים, לפי הסדר{allowFutureDates ? "." : " ועד היום."}</p>}
      <div className="sticky -bottom-4 mt-4 flex items-center justify-between border-t bg-popover py-3"><button type="button" className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent" onClick={() => { select(undefined); onChange(undefined); setOpen(false); }}>נקה בחירה</button><button type="button" disabled={!valid} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40" onClick={() => { if (valid && from && to) { onChange({ from, to }); setOpen(false); } }}>הצגת התקופה</button></div>
    </PopoverContent>
  </Popover>;
}
