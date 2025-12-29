"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type CapsuleOption = {
  id: string;
  label: string;
  icon?: LucideIcon;
  badge?: ReactNode;
};

type AdminPageHeaderProps = {
  icon: LucideIcon;
  title: string;
  /** Optional connection indicator or other status element */
  statusElement?: ReactNode;
  /** Capsule selector options - renders inline in header */
  capsules?: {
    options: CapsuleOption[];
    activeId: string;
    onChange: (id: string) => void;
  };
  /** Optional action buttons for the header */
  actions?: ReactNode;
};

export const AdminPageHeader = ({
  icon: Icon,
  title,
  statusElement,
  capsules,
  actions,
}: AdminPageHeaderProps) => {
  return (
    <div className="flex flex-col gap-3">
      {/* Main header row - icon, title, status, and actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-primary shrink-0" />
          <h1 className="text-lg font-semibold text-foreground sm:text-xl">{title}</h1>
          {statusElement}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">
            {actions}
          </div>
        )}
      </div>

      {/* Capsule selector row - if provided */}
      {capsules && (
        <div className="flex items-center">
          <div className="inline-flex items-center gap-1 p-1 rounded-lg border border-border bg-card/80 backdrop-blur-sm">
            {capsules.options.map((option) => {
              const isActive = capsules.activeId === option.id;
              const OptionIcon = option.icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => capsules.onChange(option.id)}
                  className={cn(
                    "relative flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                    "sm:gap-2 sm:px-4 sm:py-2",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  )}
                >
                  {OptionIcon && (
                    <OptionIcon className={cn(
                      "h-4 w-4 shrink-0",
                      isActive ? "text-primary-foreground" : ""
                    )} />
                  )}
                  <span className="hidden xs:inline sm:inline">{option.label}</span>
                  {option.badge}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
