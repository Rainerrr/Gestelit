"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ניהול סוגי תחנות</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {stationTypes.map((type) => (
          <div
            key={type}
            className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1"
          >
            <Badge variant="secondary">{type}</Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void handleClear(type)}
              disabled={loadingKey === type}
            >
              {loadingKey === type ? "מנקה..." : "הסר"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

