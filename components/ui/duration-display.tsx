"use client";

import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveDuration, formatDurationHMS } from "@/lib/hooks/useLiveDuration";

type DurationDisplayProps = {
  startedAt: string;
  endedAt?: string | null;
  variant?: "default" | "compact";
};

export const DurationDisplay = ({
  startedAt,
  endedAt,
  variant = "default",
}: DurationDisplayProps) => {
  const { seconds, isLive } = useLiveDuration(startedAt, endedAt);

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border",
        variant === "compact" ? "px-2 py-0.5" : "px-2.5 py-1",
        isLive
          ? "bg-emerald-500/10 border-emerald-500/25"
          : "bg-muted/30 border-border/50"
      )}
    >
      <Timer
        className={cn(
          variant === "compact" ? "h-3 w-3" : "h-3.5 w-3.5",
          isLive ? "text-emerald-400" : "text-muted-foreground"
        )}
      />
      <span
        className={cn(
          "font-mono tabular-nums tracking-tight",
          variant === "compact" ? "text-xs" : "text-sm",
          isLive ? "text-emerald-400 font-medium" : "text-muted-foreground"
        )}
      >
        {formatDurationHMS(seconds)}
      </span>
    </div>
  );
};
