"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

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

  return (
    <Card className="border-0 bg-white shadow-none">
      <CardContent className="p-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 text-right">
            <label className="text-sm font-semibold text-slate-700">
              עובד
            </label>
            <Select
              value={value.workerId ?? ALL_VALUE}
              onValueChange={(next) =>
                handleWorkerChange(next === ALL_VALUE ? undefined : next)
              }
            >
              <SelectTrigger aria-label="סינון לפי עובד">
                <SelectValue placeholder="כל העובדים" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>כל העובדים</SelectItem>
                {workers.map((worker) => (
                  <SelectItem key={worker.id} value={worker.id}>
                    {worker.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 text-right">
            <label className="text-sm font-semibold text-slate-700">
              תחנה
            </label>
            <Select
              value={value.stationId ?? ALL_VALUE}
              onValueChange={(next) =>
                handleStationChange(next === ALL_VALUE ? undefined : next)
              }
            >
              <SelectTrigger aria-label="סינון לפי תחנה">
                <SelectValue placeholder="כל התחנות" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>כל התחנות</SelectItem>
                {stations.map((station) => (
                  <SelectItem key={station.id} value={station.id}>
                    {station.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 text-right">
            <label className="text-sm font-semibold text-slate-700">
              פק&quot;ע
            </label>
            <Select
              value={value.jobNumber ?? ALL_VALUE}
              onValueChange={(next) =>
                handleJobNumberChange(
                  next === ALL_VALUE ? undefined : next.trim(),
                )
              }
            >
              <SelectTrigger aria-label='סינון לפי פק"ע'>
                <SelectValue placeholder='בחר פק"ע או הקלד' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>כל הפק&quot;עים</SelectItem>
                {sortedJobNumbers.map((job) => (
                  <SelectItem key={job} value={job}>
                    {job}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              aria-label='חיפוש פק"ע'
              placeholder='חיפוש לפי פק"ע'
              value={value.jobNumber ?? ""}
              onChange={(event) =>
                handleJobNumberChange(event.target.value || undefined)
              }
              className="text-right"
            />
          </div>

          <div className="flex items-end justify-start">
            <Button
              variant="outline"
              onClick={handleClear}
              aria-label="ניקוי מסננים"
            >
              ניקוי מסננים
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

