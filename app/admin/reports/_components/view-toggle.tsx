"use client";

import { List, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ViewMode } from "@/lib/hooks/useViewToggle";

type ViewToggleProps = {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
};

export const ViewToggle = ({ value, onChange }: ViewToggleProps) => {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-muted/50 border border-border/50">
      <Button
        variant={value === "feed" ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onChange("feed")}
        className={cn(
          "h-8 gap-2 text-sm font-medium transition-all",
          value === "feed"
            ? "bg-background shadow-sm"
            : "hover:bg-background/50"
        )}
      >
        <List className="h-4 w-4" />
        <span>פיד</span>
      </Button>
      <Button
        variant={value === "station" ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onChange("station")}
        className={cn(
          "h-8 gap-2 text-sm font-medium transition-all",
          value === "station"
            ? "bg-background shadow-sm"
            : "hover:bg-background/50"
        )}
      >
        <Building2 className="h-4 w-4" />
        <span>לפי תחנות</span>
      </Button>
    </div>
  );
};
