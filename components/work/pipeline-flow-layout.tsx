"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

// ============================================
// PIPELINE POSITION COLOR UTILITY
// ============================================

/**
 * Returns a hex color for a pipeline station based on its position.
 * Blue gradient: primary (#0661D0) → cyan (#06B6D4) for non-terminal.
 * Terminal station is emerald.
 */
export const getPipelinePositionColor = (
  idx: number,
  total: number,
  isTerminal: boolean
): { bg: string; hex: string } => {
  if (isTerminal) return { bg: "bg-emerald-500", hex: "#10b981" };
  if (total <= 1) return { bg: "bg-primary", hex: "#0661D0" };

  // Blue gradient: primary(6,97,208) → cyan(6,182,212)
  const ratio = idx / Math.max(1, total - 1);
  const r = 6;
  const g = Math.round(97 + (182 - 97) * ratio);
  const b = Math.round(208 + (212 - 208) * ratio);
  const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;

  return { bg: "bg-primary", hex };
};

// ============================================
// TYPES
// ============================================

export type PipelineStation = {
  id: string;
  name: string;
  position: number;
  isTerminal: boolean;
};

type PipelineFlowLayoutProps = {
  stations: PipelineStation[];
  /**
   * Each child should have TWO elements:
   * 1. A "label" element (station name, numbers, etc.) — rendered full-width above
   * 2. A "bar" element (JobProgressBar) — rendered next to the dot
   *
   * If the child has a single element, the dot centers with the whole child.
   */
  children: React.ReactNode;
  className?: string;
  /** Set of station IDs (jobItemStepId) where good >= planned — gets completion ring */
  completedStationIds?: Set<string>;
  /** Set of station IDs with active worker sessions — gets pulse animation */
  activeStationIds?: Set<string>;
};

// ============================================
// COMPONENT
// ============================================

/**
 * Vertical pipeline flow layout.
 * Each station renders: [label row full-width] then [dot | bar] with dot centered to bar.
 * RTL: dot (first flex child) appears on the right.
 */
export const PipelineFlowLayout = ({
  stations,
  children,
  className,
  completedStationIds,
  activeStationIds,
}: PipelineFlowLayoutProps) => {
  const childArray = React.Children.toArray(children);

  if (stations.length === 0) return <>{children}</>;

  return (
    <div className={cn("space-y-0.5", className)}>
      {stations.map((station, idx) => {
        const color = getPipelinePositionColor(idx, stations.length, station.isTerminal);
        const isLast = idx === stations.length - 1;
        const child = childArray[idx];
        const isStationComplete = completedStationIds?.has(station.id) ?? false;
        const isStationActive = activeStationIds?.has(station.id) ?? false;

        // Split child into label (first inner child) and bar (rest)
        let labelPart: React.ReactNode = null;
        let barPart: React.ReactNode = child;

        if (React.isValidElement(child)) {
          const innerChildren = React.Children.toArray(
            (child.props as { children?: React.ReactNode }).children
          );
          if (innerChildren.length >= 2) {
            labelPart = innerChildren[0];
            barPart = innerChildren.slice(1);
          }
        }

        return (
          <div key={station.id}>
            {/* Label row — indented to align with bar start (past the dot + gap) */}
            {labelPart && (
              <div className="mb-0.5 ps-[22px]">
                {labelPart}
              </div>
            )}

            {/* Bar row with dot — dot aligned to bar top edge */}
            <div className="flex items-start gap-2">
              {/* Dot — first child = right side in RTL, nudged down to center with h-3 bar */}
              <div className="flex-shrink-0 w-3.5 flex justify-center relative">
                {isStationActive && (
                  <div
                    className="absolute inset-0 rounded-full animate-ping opacity-40"
                    style={{ backgroundColor: color.hex }}
                  />
                )}
                <div
                  className={cn(
                    "w-3.5 h-3.5 rounded-full transition-all relative",
                    isStationComplete && "ring-2 ring-emerald-400/40 shadow-[0_0_6px_rgba(16,185,129,0.3)]",
                    isStationActive && !isStationComplete && "ring-2 ring-offset-1 ring-offset-background"
                  )}
                  style={{
                    backgroundColor: color.hex,
                    ...(isStationActive && !isStationComplete ? { boxShadow: `0 0 8px ${color.hex}80` } : {}),
                  }}
                />
              </div>

              {/* Bar content */}
              <div className="flex-1 min-w-0">
                {barPart}
              </div>
            </div>

            {/* Arrow connector — centered under dot */}
            {!isLast && (
              <div className="flex items-start gap-2 -my-1">
                <div className="flex-shrink-0 w-3.5 flex flex-col items-center">
                  <div className="w-px h-1 bg-border/60" />
                  <ChevronDown className="h-3 w-3 text-muted-foreground/40 -mt-1" />
                </div>
                <div className="flex-1 min-w-0" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
