"use client";

import * as React from "react";
import { format, isSameDay, parse, isValid } from "date-fns";
import { he } from "date-fns/locale";
import { Calendar as CalendarIcon, X, ChevronLeft, ChevronRight } from "lucide-react";
import { DateRange, DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type DateRangePickerProps = {
  value?: DateRange;
  onChange: (range: DateRange | undefined) => void;
  placeholder?: string;
  className?: string;
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

export const DateRangePicker = ({
  value,
  onChange,
  placeholder = "בחר תאריכים",
  className,
}: DateRangePickerProps) => {
  const [open, setOpen] = React.useState(false);
  const [tempRange, setTempRange] = React.useState<DateRange | undefined>(value);
  const [currentMonth, setCurrentMonth] = React.useState<Date>(() => {
    if (value?.from) return value.from;
    return new Date();
  });

  // Input states for manual date entry
  const [fromInput, setFromInput] = React.useState("");
  const [toInput, setToInput] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setTempRange(value);
      if (value?.from) {
        setCurrentMonth(value.from);
        setFromInput(format(value.from, "dd/MM/yyyy"));
      } else {
        setFromInput("");
      }
      if (value?.to) {
        setToInput(format(value.to, "dd/MM/yyyy"));
      } else {
        setToInput("");
      }
    }
  }, [open, value]);

  // Sync input fields when tempRange changes from calendar selection
  React.useEffect(() => {
    if (tempRange?.from) {
      setFromInput(format(tempRange.from, "dd/MM/yyyy"));
    }
    if (tempRange?.to) {
      setToInput(format(tempRange.to, "dd/MM/yyyy"));
    }
  }, [tempRange?.from, tempRange?.to]);

  const handleSelect = (range: DateRange | undefined) => {
    setTempRange(range);
  };

  const handleFromInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setFromInput(inputValue);

    const parsed = parse(inputValue, "dd/MM/yyyy", new Date());
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    if (isValid(parsed) && inputValue.length === 10 && parsed <= now) {
      setTempRange((prev) => ({
        from: parsed,
        to: prev?.to && parsed <= prev.to ? prev.to : undefined,
      }));
      setCurrentMonth(parsed);
    }
  };

  const handleToInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setToInput(inputValue);

    const parsed = parse(inputValue, "dd/MM/yyyy", new Date());
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    if (isValid(parsed) && inputValue.length === 10 && tempRange?.from && parsed >= tempRange.from && parsed <= now) {
      setTempRange((prev) => ({
        from: prev?.from,
        to: parsed,
      }));
    }
  };

  const handleApply = () => {
    onChange(tempRange);
    setOpen(false);
  };

  const handleClear = () => {
    setTempRange(undefined);
    setFromInput("");
    setToInput("");
    onChange(undefined);
    setOpen(false);
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

  const nextMonth = React.useMemo(() => {
    const next = new Date(currentMonth);
    next.setMonth(next.getMonth() + 1);
    return next;
  }, [currentMonth]);

  const formatDisplayDate = () => {
    if (!value?.from) return placeholder;

    const fromStr = format(value.from, "d בMMM yyyy", { locale: he });
    if (!value.to || isSameDay(value.from, value.to)) {
      return fromStr;
    }
    const toStr = format(value.to, "d בMMM yyyy", { locale: he });
    return `${fromStr} - ${toStr}`;
  };

  const hasSelection = Boolean(value?.from);

  // Today's date at start of day for disabling future dates
  const today = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Calendar classNames for proper range highlighting in RTL
  // Buttons stay fixed size - highlighting is done via cell backgrounds (see globals.css)
  // Include rdp- classes so CSS selectors work
  const calendarClassNames = {
    months: "flex",
    month: "space-y-2",
    month_caption: "hidden",
    nav: "hidden",
    month_grid: "w-full border-collapse",
    weekdays: "flex",
    weekday: "text-muted-foreground w-9 font-normal text-[0.8rem] text-center",
    week: "flex w-full mt-1",
    // Day cell: fixed size, flex centering for smaller buttons, backgrounds via CSS :has()
    day: "rdp-day relative p-0 text-center text-sm h-9 w-9 flex items-center justify-center",
    // Day button: FIXED size, never changes dimensions
    day_button: cn(
      "h-9 w-9 p-0 font-normal transition-colors rounded-full",
      "hover:bg-accent/80 hover:text-accent-foreground",
      "focus:outline-none focus:ring-2 focus:ring-primary/30"
    ),
    // Range start: blue circle with band behind (styled via CSS ::before)
    range_start: "rdp-range_start relative z-10 bg-primary text-primary-foreground rounded-full hover:bg-primary/90",
    // Range end: blue circle with band behind (styled via CSS ::before)
    range_end: "rdp-range_end relative z-10 bg-primary text-primary-foreground rounded-full hover:bg-primary/90",
    // Selected (single day only - range classes override for ranges)
    selected: "bg-primary text-primary-foreground hover:bg-primary/90 rounded-full",
    // Today indicator
    today: "ring-1 ring-inset ring-primary/40",
    // Outside days
    outside: "text-muted-foreground/50",
    // Disabled
    disabled: "text-muted-foreground/40 cursor-not-allowed hover:bg-transparent",
    // Range middle: neutral band, no circle (CSS handles background)
    range_middle: "rdp-range_middle text-foreground",
    hidden: "invisible",
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              setOpen(true);
            }
          }}
          className={cn(
            "inline-flex items-center gap-2 whitespace-nowrap rounded-md text-sm font-normal h-9 px-4 py-2 cursor-pointer",
            "border border-input bg-secondary text-foreground shadow-sm",
            "hover:bg-accent hover:text-accent-foreground",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            !value?.from && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="ml-2 h-4 w-4 shrink-0" />
          <span className="truncate">{formatDisplayDate()}</span>
          {hasSelection && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onChange(undefined);
                }
              }}
              className="mr-auto p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              aria-label="נקה תאריכים"
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
          {/* Date inputs - centered above calendars */}
          <div className="flex items-center justify-center gap-2 mb-3 pb-3 border-b border-border">
            <input
              type="text"
              placeholder="DD/MM/YYYY"
              value={fromInput}
              onChange={handleFromInputChange}
              className="w-[90px] h-7 px-2 text-xs border border-input bg-secondary rounded text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
              dir="ltr"
            />
            <span className="text-muted-foreground text-xs">—</span>
            <input
              type="text"
              placeholder="DD/MM/YYYY"
              value={toInput}
              onChange={handleToInputChange}
              className="w-[90px] h-7 px-2 text-xs border border-input bg-secondary rounded text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
              dir="ltr"
            />
          </div>

          {/* Month headers with navigation arrows on sides */}
          <div className="flex items-center justify-between mb-2">
            {/* Right arrow (prev month in RTL) */}
            <button
              type="button"
              onClick={handlePrevMonth}
              className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              aria-label="חודש קודם"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            {/* Month titles */}
            <div className="flex flex-1 justify-around">
              <span className="text-sm font-medium text-foreground">
                {hebrewMonths[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </span>
              <span className="text-sm font-medium text-foreground hidden sm:block">
                {hebrewMonths[nextMonth.getMonth()]} {nextMonth.getFullYear()}
              </span>
            </div>

            {/* Left arrow (next month in RTL) */}
            <button
              type="button"
              onClick={handleNextMonth}
              className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              aria-label="חודש הבא"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>

          {/* Dual calendar view */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            {/* First month */}
            <div className="flex flex-col">
              {/* Mobile-only month title */}
              <div className="text-center text-sm font-medium mb-2 text-foreground sm:hidden">
                {hebrewMonths[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </div>
              <DayPicker
                mode="range"
                selected={tempRange}
                onSelect={handleSelect}
                month={currentMonth}
                onMonthChange={setCurrentMonth}
                showOutsideDays={false}
                locale={he}
                weekStartsOn={0}
                disabled={{ after: today }}
                formatters={{
                  formatWeekdayName: (date) => hebrewDays[date.getDay()],
                }}
                classNames={calendarClassNames}
              />
            </div>

            {/* Second month */}
            <div className="flex flex-col">
              {/* Mobile-only month title */}
              <div className="text-center text-sm font-medium mb-2 text-foreground sm:hidden">
                {hebrewMonths[nextMonth.getMonth()]} {nextMonth.getFullYear()}
              </div>
              <DayPicker
                mode="range"
                selected={tempRange}
                onSelect={handleSelect}
                month={nextMonth}
                showOutsideDays={false}
                locale={he}
                weekStartsOn={0}
                disabled={{ after: today }}
                formatters={{
                  formatWeekdayName: (date) => hebrewDays[date.getDay()],
                }}
                classNames={calendarClassNames}
              />
            </div>
          </div>

          {/* Footer with actions */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
            >
              נקה
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              className="h-8 px-4 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
            >
              החל
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
