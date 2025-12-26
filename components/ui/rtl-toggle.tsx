"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface RTLToggleProps {
  id?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  variant?: "default" | "danger" | "warning";
}

/**
 * RTL-compatible toggle component that works correctly in both LTR and RTL layouts.
 * Uses flexbox with justify-start/justify-end which automatically handles RTL.
 */
const RTLToggle = React.forwardRef<HTMLButtonElement, RTLToggleProps>(
  (
    {
      id,
      checked = false,
      onCheckedChange,
      disabled = false,
      className,
      "aria-label": ariaLabel,
      variant = "default",
    },
    ref
  ) => {
    const handleClick = () => {
      if (!disabled && onCheckedChange) {
        onCheckedChange(!checked);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        handleClick();
      }
    };

    return (
      <button
        ref={ref}
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          // Base styles - pill shape container with flexbox for RTL-safe positioning
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full px-0.5",
          "transition-colors duration-200 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Background color states
          checked
            ? variant === "danger"
              ? "bg-red-500"
              : variant === "warning"
                ? "bg-amber-500"
                : "bg-primary"
            : "bg-input",
          // Flexbox justify handles the thumb position - RTL-aware automatically
          checked ? "justify-end" : "justify-start",
          className
        )}
      >
        {/* Thumb - positioned via flexbox justify-start/justify-end */}
        <span
          className={cn(
            "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-md",
            "transition-all duration-200 ease-out"
          )}
        />
      </button>
    );
  }
);

RTLToggle.displayName = "RTLToggle";

export { RTLToggle };
