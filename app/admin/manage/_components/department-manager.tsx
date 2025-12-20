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
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800/60">
        <h3 className="text-base font-semibold text-zinc-100">ניהול מחלקות</h3>
      </div>
      <div className="p-4 flex flex-wrap gap-2">
        {departments.map((dept) => (
          <div
            key={dept}
            className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800/50 px-3 py-1"
          >
            <Badge variant="secondary" className="bg-zinc-700 text-zinc-200 border-zinc-600">{dept}</Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void handleClear(dept)}
              disabled={loadingKey === dept}
              className="text-zinc-400 hover:text-red-400 hover:bg-transparent"
            >
              {loadingKey === dept ? "מנקה..." : "הסר"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};


