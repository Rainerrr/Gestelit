import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildSalesFollowUpCalendarUrl } from "@/lib/calendar";
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
        title="יש לבחור תאריך לפני ההוספה ליומן"
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
        title="הוספה ליומן Google"
        aria-label="הוספת הפעולה הבאה ליומן Google"
      >
        <CalendarPlus className="h-3.5 w-3.5" />
        הוסף ליומן
      </a>
    </Button>
  );
}
