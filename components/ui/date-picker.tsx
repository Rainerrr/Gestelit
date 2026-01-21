"use client";

import * as React from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { Calendar as CalendarIcon, X, ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type DatePickerProps = {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
  /** Allow selecting dates in the past */
  allowPast?: boolean;
  /** Allow selecting dates in the future */
  allowFuture?: boolean;
  id?: string;
};

const hebrewMonths = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

const hebrewDays = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

export const DatePicker = ({
  value,
  onChange,
  placeholder = "בחר תאריך",
  className,
  allowPast = true,
  allowFuture = true,
  id,
}: DatePickerProps) => {
  const [open, setOpen] = React.useState(false);
  const [currentMonth, setCurrentMonth] = React.useState<Date>(() => {
    if (value) return value;
    return new Date();
  });

  React.useEffect(() => {
    if (open && value) {
      setCurrentMonth(value);
    }
  }, [open, value]);

  const handleSelect = (date: Date | undefined) => {
    onChange(date);
    if (date) {
      setOpen(false);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(undefined);
  };

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() - 1);
      return newDate;
    });
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
  };

  const formatDisplayDate = () => {
    if (!value) return placeholder;
    return format(value, "d בMMM yyyy", { locale: he });
  };

  const hasSelection = Boolean(value);

  // Date constraints
  const today = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Build disabled matchers array for react-day-picker
  const disabledMatchers = React.useMemo(() => {
    const matchers: Array<{ before: Date } | { after: Date }> = [];
    if (!allowPast) {
      matchers.push({ before: today });
    }
    if (!allowFuture) {
      matchers.push({ after: today });
    }
    return matchers.length > 0 ? matchers : undefined;
  }, [allowPast, allowFuture, today]);

  const calendarClassNames = {
    months: "flex",
    month: "space-y-2",
    month_caption: "hidden",
    nav: "hidden",
    month_grid: "w-full border-collapse",
    weekdays: "flex",
    weekday: "text-muted-foreground w-9 font-normal text-[0.8rem] text-center",
    week: "flex w-full mt-1",
    day: "relative p-0 text-center text-sm h-9 w-9 flex items-center justify-center",
    day_button: cn(
      "h-9 w-9 p-0 font-normal transition-colors rounded-full",
      "hover:bg-accent/80 hover:text-accent-foreground",
      "focus:outline-none focus:ring-2 focus:ring-primary/30"
    ),
    selected: "bg-primary text-primary-foreground hover:bg-primary/90 rounded-full",
    today: "ring-1 ring-inset ring-primary/40",
    outside: "text-muted-foreground/50",
    disabled: "text-muted-foreground/40 cursor-not-allowed hover:bg-transparent",
    hidden: "invisible",
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          id={id}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              setOpen(true);
            }
          }}
          className={cn(
            "inline-flex items-center gap-2 whitespace-nowrap rounded-md text-sm font-normal h-10 px-4 py-2 cursor-pointer w-full",
            "border border-input bg-secondary text-foreground shadow-sm",
            "hover:bg-accent hover:text-accent-foreground",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="ml-2 h-4 w-4 shrink-0" />
          <span className="truncate flex-1 text-right">{formatDisplayDate()}</span>
          {hasSelection && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onChange(undefined);
                }
              }}
              className="mr-auto p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              aria-label="נקה תאריך"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 border-input bg-popover"
        align="start"
        side="bottom"
        sideOffset={4}
        collisionPadding={16}
        avoidCollisions={true}
      >
        <div className="p-3">
          {/* Month header with navigation */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              aria-label="חודש קודם"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <span className="text-sm font-medium text-foreground">
              {hebrewMonths[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </span>

            <button
              type="button"
              onClick={handleNextMonth}
              className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              aria-label="חודש הבא"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>

          {/* Calendar */}
          <DayPicker
            mode="single"
            selected={value}
            onSelect={handleSelect}
            month={currentMonth}
            onMonthChange={setCurrentMonth}
            showOutsideDays={false}
            locale={he}
            weekStartsOn={0}
            disabled={disabledMatchers}
            formatters={{
              formatWeekdayName: (date) => hebrewDays[date.getDay()],
            }}
            classNames={calendarClassNames}
          />

          {/* Footer with clear button */}
          {hasSelection && (
            <div className="flex items-center justify-center mt-3 pt-3 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onChange(undefined);
                  setOpen(false);
                }}
                className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
              >
                נקה בחירה
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
