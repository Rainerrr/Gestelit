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

type CapsuleConfig = {
  options: CapsuleOption[];
  activeId: string;
  onChange: (id: string) => void;
};

type AdminPageHeaderProps = {
  icon: LucideIcon;
  title: string;
  /** Optional connection indicator or other status element */
  statusElement?: ReactNode;
  /** Capsule selector options - renders inline in header on desktop */
  capsules?: CapsuleConfig;
  /** Optional action buttons for the header */
  actions?: ReactNode;
};

/** Mobile bottom bar component - must be rendered via AdminLayout's mobileBottomBar prop */
export const MobileBottomBar = ({ capsules }: { capsules: CapsuleConfig }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden">
      <div className="border-t border-border/80 bg-card/95 backdrop-blur-md px-2 py-1.5 safe-area-pb">
        <div className="flex items-center justify-around">
          {capsules.options.map((option) => {
            const isActive = capsules.activeId === option.id;
            const OptionIcon = option.icon;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => capsules.onChange(option.id)}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg transition-colors min-w-[4rem]",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground active:bg-accent"
                )}
              >
                {OptionIcon && (
                  <OptionIcon className={cn(
                    "h-5 w-5",
                    isActive ? "text-primary" : ""
                  )} />
                )}
                <span className={cn(
                  "text-[11px] font-medium",
                  isActive ? "text-primary" : ""
                )}>
                  {option.label}
                </span>
                {option.badge}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const AdminPageHeader = ({
  icon: Icon,
  title,
  statusElement,
  capsules,
  actions,
}: AdminPageHeaderProps) => {
  return (
    <div className="flex items-center justify-between gap-4">
      {/* Left: Title group */}
      <div className="flex items-center gap-2.5 shrink-0">
        <Icon className="h-5 w-5 text-primary shrink-0" />
        <h1 className="text-lg font-semibold text-foreground sm:text-xl">{title}</h1>
        {statusElement}
      </div>

      {/* Center: Capsule selector - desktop only */}
      {capsules && (
        <div className="hidden sm:flex flex-1 justify-center">
          <div className="inline-flex items-center gap-0.5 p-1 rounded-xl border border-border/80 bg-muted/50 shadow-sm">
            {capsules.options.map((option) => {
              const isActive = capsules.activeId === option.id;
              const OptionIcon = option.icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => capsules.onChange(option.id)}
                  className={cn(
                    "relative flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200",
                    isActive
                      ? "bg-background text-foreground shadow-sm border border-border/50"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                  )}
                >
                  {OptionIcon && (
                    <OptionIcon className={cn(
                      "h-4 w-4 shrink-0",
                      isActive ? "text-primary" : ""
                    )} />
                  )}
                  <span>{option.label}</span>
                  {option.badge}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Right: Actions */}
      {actions && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
};
