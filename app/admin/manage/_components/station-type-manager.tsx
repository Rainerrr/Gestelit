"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type StationTypeManagerProps = {
  stationTypes: string[];
  onClear: (stationType: string) => Promise<void>;
};

export const StationTypeManager = ({
  stationTypes,
  onClear,
}: StationTypeManagerProps) => {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const handleClear = async (stationType: string) => {
    setLoadingKey(stationType);
    await onClear(stationType);
    setLoadingKey(null);
  };

  if (stationTypes.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800/60">
        <h3 className="text-base font-semibold text-zinc-100">ניהול סוגי תחנות</h3>
      </div>
      <div className="p-4 flex flex-wrap gap-2">
        {stationTypes.map((type) => (
          <div
            key={type}
            className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800/50 px-3 py-1"
          >
            <Badge variant="secondary" className="bg-zinc-700 text-zinc-200 border-zinc-600">{type}</Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void handleClear(type)}
              disabled={loadingKey === type}
              className="text-zinc-400 hover:text-red-400 hover:bg-transparent"
            >
              {loadingKey === type ? "מנקה..." : "הסר"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

