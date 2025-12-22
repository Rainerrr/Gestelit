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
import { Search, User, MapPin, FileText, X } from "lucide-react";

type Option = { id: string; label: string };

export type HistoryFiltersState = {
  workerId?: string;
  stationId?: string;
  jobNumber?: string;
};

type HistoryFiltersProps = {
  workers: Option[];
  stations: Option[];
  jobNumbers: string[];
  value: HistoryFiltersState;
  onChange: (next: HistoryFiltersState) => void;
};

export const HistoryFilters = ({
  workers,
  stations,
  jobNumbers,
  value,
  onChange,
}: HistoryFiltersProps) => {
  const ALL_VALUE = "__all__";

  const sortedJobNumbers = useMemo(
    () => Array.from(new Set(jobNumbers)).filter(Boolean),
    [jobNumbers],
  );

  const handleWorkerChange = (workerId?: string) =>
    onChange({ ...value, workerId });

  const handleStationChange = (stationId?: string) =>
    onChange({ ...value, stationId });

  const handleJobNumberChange = (jobNumber?: string) =>
    onChange({ ...value, jobNumber });

  const handleClear = () => onChange({});

  const activeFiltersCount = [value.workerId, value.stationId, value.jobNumber].filter(Boolean).length;

  const getWorkerLabel = () => {
    if (!value.workerId) return null;
    return workers.find((worker) => worker.id === value.workerId)?.label;
  };

  const getStationLabel = () => {
    if (!value.stationId) return null;
    return stations.find((station) => station.id === value.stationId)?.label;
  };

  return (
    <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
      {/* Search bar - most prominent */}
      <div className="p-4 border-b border-border">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label='חיפוש פק"ע'
            placeholder='חיפוש לפי מספר פק"ע...'
            value={value.jobNumber ?? ""}
            onChange={(event) =>
              handleJobNumberChange(event.target.value || undefined)
            }
            className="pr-10 text-right h-11 text-base border-input bg-secondary text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
          />
          {value.jobNumber && (
            <button
              type="button"
              onClick={() => handleJobNumberChange(undefined)}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              aria-label="נקה חיפוש"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filter dropdowns row */}
      <div className="p-4 flex flex-wrap items-center gap-3">
        {/* Worker filter */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted shrink-0">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <Select
            value={value.workerId ?? ALL_VALUE}
            onValueChange={(next) =>
              handleWorkerChange(next === ALL_VALUE ? undefined : next)
            }
          >
            <SelectTrigger
              aria-label="סינון לפי עובד"
              className="w-[160px] border-input bg-secondary text-foreground focus:ring-primary/30 h-9"
            >
              <SelectValue placeholder="כל העובדים" />
            </SelectTrigger>
            <SelectContent className="border-input bg-popover max-h-[280px]">
              <SelectItem value={ALL_VALUE} className="text-foreground focus:bg-accent">
                כל העובדים
              </SelectItem>
              {workers.map((worker) => (
                <SelectItem key={worker.id} value={worker.id} className="text-foreground focus:bg-accent">
                  {worker.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-border hidden sm:block" />

        {/* Station filter */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted shrink-0">
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </div>
          <Select
            value={value.stationId ?? ALL_VALUE}
            onValueChange={(next) =>
              handleStationChange(next === ALL_VALUE ? undefined : next)
            }
          >
            <SelectTrigger
              aria-label="סינון לפי תחנה"
              className="w-[160px] border-input bg-secondary text-foreground focus:ring-primary/30 h-9"
            >
              <SelectValue placeholder="כל התחנות" />
            </SelectTrigger>
            <SelectContent className="border-input bg-popover max-h-[280px]">
              <SelectItem value={ALL_VALUE} className="text-foreground focus:bg-accent">
                כל התחנות
              </SelectItem>
              {stations.map((station) => (
                <SelectItem key={station.id} value={station.id} className="text-foreground focus:bg-accent">
                  {station.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-border hidden sm:block" />

        {/* Job number dropdown (quick select from existing) */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted shrink-0">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <Select
            value={value.jobNumber ?? ALL_VALUE}
            onValueChange={(next) =>
              handleJobNumberChange(next === ALL_VALUE ? undefined : next.trim())
            }
          >
            <SelectTrigger
              aria-label='בחירת פק"ע'
              className="w-[140px] border-input bg-secondary text-foreground focus:ring-primary/30 h-9"
            >
              <SelectValue placeholder='בחר פק"ע' />
            </SelectTrigger>
            <SelectContent className="border-input bg-popover max-h-[280px]">
              <SelectItem value={ALL_VALUE} className="text-foreground focus:bg-accent">
                כל הפק״עים
              </SelectItem>
              {sortedJobNumbers.map((job) => (
                <SelectItem key={job} value={job} className="text-foreground focus:bg-accent font-mono">
                  {job}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

      {/* Active filters chips */}
      {activeFiltersCount > 0 && (
        <div className="px-4 pb-4 flex flex-wrap gap-2">
          {value.workerId && (
            <button
              type="button"
              onClick={() => handleWorkerChange(undefined)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
            >
              <User className="h-3 w-3" />
              <span>{getWorkerLabel()}</span>
              <X className="h-3 w-3 mr-0.5" />
            </button>
          )}
          {value.stationId && (
            <button
              type="button"
              onClick={() => handleStationChange(undefined)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
            >
              <MapPin className="h-3 w-3" />
              <span>{getStationLabel()}</span>
              <X className="h-3 w-3 mr-0.5" />
            </button>
          )}
          {value.jobNumber && (
            <button
              type="button"
              onClick={() => handleJobNumberChange(undefined)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/20 transition-colors font-mono"
            >
              <FileText className="h-3 w-3" />
              <span>{value.jobNumber}</span>
              <X className="h-3 w-3 mr-0.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

