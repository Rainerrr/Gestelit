"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ניהול מחלקות</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {departments.map((dept) => (
          <div
            key={dept}
            className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1"
          >
            <Badge variant="secondary">{dept}</Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void handleClear(dept)}
              disabled={loadingKey === dept}
            >
              {loadingKey === dept ? "מנקה..." : "הסר"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};


