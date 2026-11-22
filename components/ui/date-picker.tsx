"use client";
import { useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { hebrewDate } from "@/lib/format/hebrew";
import { dateKey, HebrewCalendar } from "./hebrew-calendar";

type DatePickerProps = {
  value?: Date; onChange: (date: Date | undefined) => void; placeholder?: string; className?: string;
  allowPast?: boolean; allowFuture?: boolean; id?: string; label?: string; clearable?: boolean;
};
export function DatePicker({ value, onChange, placeholder = "בחרו תאריך", className, allowPast = true, allowFuture = true, id, label = "בחירת תאריך", clearable = true }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value ?? new Date());
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const disabled = [...(!allowPast ? [{ before: today }] : []), ...(!allowFuture ? [{ after: today }] : [])];
  return <Popover open={open} onOpenChange={(next) => { if (next) setMonth(value ?? new Date()); setOpen(next); }}>
    <div dir="rtl" className={cn("flex min-w-0 items-center rounded-xl border border-input bg-card", className)}>
      <PopoverTrigger asChild><button id={id} type="button" aria-label={`${label}: ${value ? hebrewDate(dateKey(value)) : placeholder}`} className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-start text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground"/><span className="min-w-0 flex-1">{value ? hebrewDate(dateKey(value)) : placeholder}</span>
      </button></PopoverTrigger>
      {value && clearable && <button type="button" aria-label="נקה תאריך" onClick={() => onChange(undefined)} className="me-1 rounded-lg p-2 text-muted-foreground hover:bg-accent"><X className="h-3.5 w-3.5"/></button>}
    </div>
    <PopoverContent dir="rtl" align="start" collisionPadding={12} className="w-auto max-w-[calc(100vw-24px)] rounded-2xl p-4">
      <HebrewCalendar mode="single" required month={month} onMonthChange={setMonth} selected={value} disabled={disabled} onSelect={(date) => { onChange(date); setOpen(false); }}/>
    </PopoverContent>
  </Popover>;
}
