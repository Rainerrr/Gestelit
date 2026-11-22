"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DayPickerProps } from "react-day-picker";
import { he } from "date-fns/locale";
import { hebrewDate } from "@/lib/format/hebrew";

export const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const shiftMonth = (d: Date, amount: number) => new Date(d.getFullYear(), d.getMonth() + amount, 1);
export function HebrewCalendar({ month, onMonthChange, ...props }: DayPickerProps & { month: Date; onMonthChange: (date: Date) => void }) {
  return <div dir="rtl" className="w-[280px] max-w-full space-y-3">
    <div className="flex items-center justify-between gap-2">
      <button type="button" aria-label="חודש קודם" onClick={() => onMonthChange(shiftMonth(month, -1))} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary"><ChevronRight className="h-4 w-4"/></button>
      <span className="text-sm font-semibold" aria-live="polite">{new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(month)}</span>
      <button type="button" aria-label="חודש הבא" onClick={() => onMonthChange(shiftMonth(month, 1))} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary"><ChevronLeft className="h-4 w-4"/></button>
    </div>
    <DayPicker {...props} dir="rtl" locale={he} weekStartsOn={0} month={month} onMonthChange={onMonthChange} showOutsideDays={false}
      labels={{ labelDayButton: (date, modifiers) => `${hebrewDate(dateKey(date))}${modifiers.selected ? ", נבחר" : ""}` }}
      formatters={{ formatWeekdayName: (date) => ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"][date.getDay()] }}
      classNames={{
        months: "w-full", month: "w-full", month_caption: "hidden", nav: "hidden", month_grid: "w-full table-fixed border-collapse",
        weekday: "h-9 text-center text-xs font-normal text-muted-foreground", day: "h-10 p-0 text-center text-sm",
        day_button: "mx-auto flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        selected: "[&:not(.range-middle)>button]:bg-primary [&:not(.range-middle)>button]:text-primary-foreground [&>button]:font-semibold",
        today: "[&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-primary/40", outside: "text-muted-foreground/40",
        disabled: "text-muted-foreground/30 [&>button]:cursor-not-allowed", hidden: "invisible",
        range_middle: "range-middle bg-primary/10 [&>button]:bg-transparent [&>button]:text-foreground", range_start: "rounded-s-lg bg-primary/10", range_end: "rounded-e-lg bg-primary/10",
      }}/>
  </div>;
}
