"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type DepartmentManagerProps = {
  departments: string[];
  onClear: (department: string) => Promise<void>;
};

export const DepartmentManager = ({
  departments,
  onClear,
}: DepartmentManagerProps) => {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const handleClear = async (department: string) => {
    setLoadingKey(department);
    await onClear(department);
    setLoadingKey(null);
  };

  if (departments.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-base font-semibold text-foreground">ניהול מחלקות</h3>
      </div>
      <div className="p-4 flex flex-wrap gap-2">
        {departments.map((dept) => (
          <div
            key={dept}
            className="flex items-center gap-2 rounded-full border border-input bg-secondary/50 px-3 py-1"
          >
            <Badge variant="secondary" className="bg-muted text-foreground/80 border-input">{dept}</Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void handleClear(dept)}
              disabled={loadingKey === dept}
              className="text-muted-foreground hover:text-red-400 hover:bg-transparent"
            >
              {loadingKey === dept ? "מנקה..." : "הסר"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};


