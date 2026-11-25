"use client";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildSalesFollowUpCalendarUrl, buildFollowUpCalendar } from "@/lib/calendar";
import { cn } from "@/lib/utils";

type AddToCalendarButtonProps = {
  date: string | null | undefined;
  customerName?: string | null;
  customerCode?: number | string | null;
  nextAction?: string | null;
  calendarNote?: string | null;
  eventTypeLabel?: string | null;
  contactPerson?: string | null;
  salesperson?: string | null;
  estimatedRevenue?: number | string | null;
  currency?: string | null;
  className?: string;
};

export function AddToCalendarButton({
  date,
  customerName,
  customerCode,
  nextAction,
  calendarNote,
  eventTypeLabel,
  contactPerson,
  salesperson,
  estimatedRevenue,
  currency,
  className,
}: AddToCalendarButtonProps) {
  const calendarUrl = buildSalesFollowUpCalendarUrl({
    date,
    customerName,
    customerCode,
    nextAction,
    calendarNote,
    eventTypeLabel,
    contactPerson,
    salesperson,
    estimatedRevenue,
    currency,
  });

  if (!calendarUrl) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled
        title="צריך לבחור תאריך לפני שמוסיפים ליומן"
        className={cn("h-8 shrink-0 gap-1.5 px-2 text-xs", className)}
      >
        <CalendarPlus className="h-3.5 w-3.5" />
        הוסף ליומן
      </Button>
    );
  }

  return (
    <Button
      asChild
      type="button"
      variant="ghost"
      size="sm"
      className={cn("h-8 shrink-0 gap-1.5 px-2 text-xs text-primary", className)}
    >
      <a
        href={calendarUrl}
        target="_blank"
        rel="noreferrer"
        title="הוספת המשימה ליומן Outlook או Apple Calendar"
        aria-label="הוספת המשימה ליומן Outlook"
        onClick={(event) => {
          event.preventDefault();
          const content = buildFollowUpCalendar([{ id: crypto.randomUUID(), date, customerName, customerCode, nextAction, calendarNote, eventTypeLabel, contactPerson, salesperson, estimatedRevenue, currency }]);
          const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
          const link = document.createElement("a"); link.href = url; link.download = "gestelit-follow-up.ics"; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        <CalendarPlus className="h-3.5 w-3.5" />
        הוסף ליומן
      </a>
    </Button>
  );
}
