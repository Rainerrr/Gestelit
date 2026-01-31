"use client";

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  Search,
  User,
  Package,
  Calendar,
  X,
} from "lucide-react";
import { DateRange } from "react-day-picker";

export type JobFiltersState = {
  search?: string;
  jobItemName?: string;
  clientName?: string;
  dueDateRange?: DateRange;
  sortBy: "due_date" | "created_at" | "progress";
  sortDirection: "asc" | "desc";
};

type JobFiltersProps = {
  /** List of unique job item names for filtering */
  jobItemNames: string[];
  /** List of unique client names for filtering */
  clientNames: string[];
  value: JobFiltersState;
  onChange: (next: JobFiltersState) => void;
};

export const JobFilters = ({
  jobItemNames,
  clientNames,
  value,
  onChange,
}: JobFiltersProps) => {
  const ALL_VALUE = "__all__";

  const sortedJobItemNames = useMemo(
    () => Array.from(new Set(jobItemNames)).filter(Boolean).sort(),
    [jobItemNames]
  );

  const sortedClientNames = useMemo(
    () => Array.from(new Set(clientNames)).filter(Boolean).sort(),
    [clientNames]
  );

  const handleSearchChange = (search?: string) =>
    onChange({ ...value, search });

  const handleJobItemNameChange = (jobItemName?: string) =>
    onChange({ ...value, jobItemName });

  const handleClientNameChange = (clientName?: string) =>
    onChange({ ...value, clientName });

  const handleDueDateRangeChange = (dueDateRange?: DateRange) =>
    onChange({ ...value, dueDateRange });

  const handleClear = () =>
    onChange({
      ...value,
      search: undefined,
      jobItemName: undefined,
      clientName: undefined,
      dueDateRange: undefined,
    });

  const activeFiltersCount = [
    value.search,
    value.jobItemName,
    value.clientName,
    value.dueDateRange?.from,
  ].filter(Boolean).length;

  return (
    <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
      {/* Search bar - most prominent */}
      <div className="p-4 border-b border-border">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="חיפוש עבודה"
            placeholder='חיפוש לפי פק"ע או לקוח...'
            value={value.search ?? ""}
            onChange={(event) =>
              handleSearchChange(event.target.value || undefined)
            }
            className="pr-10 text-right h-11 text-base border-input bg-secondary text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
          />
          {value.search && (
            <button
              type="button"
              onClick={() => handleSearchChange(undefined)}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              aria-label="נקה חיפוש"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filter dropdowns row */}
      <div className="p-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {/* Job Item filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="hidden sm:flex h-8 w-8 items-center justify-center rounded-lg bg-muted shrink-0">
            <Package className="h-4 w-4 text-muted-foreground" />
          </div>
          <Select
            value={value.jobItemName ?? ALL_VALUE}
            onValueChange={(next) =>
              handleJobItemNameChange(next === ALL_VALUE ? undefined : next)
            }
          >
            <SelectTrigger
              aria-label="סינון לפי מוצר"
              className="w-full sm:w-[160px] min-h-[44px] border-input bg-secondary text-foreground focus:ring-primary/30 h-9"
            >
              <SelectValue placeholder="כל המוצרים" />
            </SelectTrigger>
            <SelectContent className="border-input bg-popover max-h-[280px]">
              <SelectItem
                value={ALL_VALUE}
                className="text-foreground focus:bg-accent"
              >
                כל המוצרים
              </SelectItem>
              {sortedJobItemNames.map((name) => (
                <SelectItem
                  key={name}
                  value={name}
                  className="text-foreground focus:bg-accent"
                >
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-border hidden sm:block" />

        {/* Client filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="hidden sm:flex h-8 w-8 items-center justify-center rounded-lg bg-muted shrink-0">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <Select
            value={value.clientName ?? ALL_VALUE}
            onValueChange={(next) =>
              handleClientNameChange(next === ALL_VALUE ? undefined : next)
            }
          >
            <SelectTrigger
              aria-label="סינון לפי לקוח"
              className="w-full sm:w-[160px] min-h-[44px] border-input bg-secondary text-foreground focus:ring-primary/30 h-9"
            >
              <SelectValue placeholder="כל הלקוחות" />
            </SelectTrigger>
            <SelectContent className="border-input bg-popover max-h-[280px]">
              <SelectItem
                value={ALL_VALUE}
                className="text-foreground focus:bg-accent"
              >
                כל הלקוחות
              </SelectItem>
              {sortedClientNames.map((name) => (
                <SelectItem
                  key={name}
                  value={name}
                  className="text-foreground focus:bg-accent"
                >
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-border hidden sm:block" />

        {/* Due Date Range filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="hidden sm:flex h-8 w-8 items-center justify-center rounded-lg bg-muted shrink-0">
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </div>
          <DateRangePicker
            value={value.dueDateRange}
            onChange={handleDueDateRangeChange}
            placeholder="סינון לפי טווח תאריכים"
            className="w-full sm:w-[220px]"
            allowFutureDates
          />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Clear button - only show when filters active */}
        {activeFiltersCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            aria-label="ניקוי מסננים"
            className="text-muted-foreground hover:text-foreground hover:bg-accent gap-2"
          >
            <X className="h-4 w-4" />
            <span>נקה ({activeFiltersCount})</span>
          </Button>
        )}
      </div>

    </div>
  );
};
