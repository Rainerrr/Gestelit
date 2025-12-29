"use client";

import { useRef, useEffect, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Lock, FileX, AlertTriangle, FileText } from "lucide-react";
import type { MachineState, StatusDefinition, StatusReportType } from "@/lib/types";
import { ALLOWED_STATUS_COLORS } from "@/lib/status";

const MACHINE_STATE_LABELS: Record<MachineState, string> = {
  production: "ייצור",
  setup: "הכנה",
  stoppage: "עצירה",
};

// Protected status labels - must match lib/data/status-definitions.ts
const PROTECTED_LABELS_HE = ["אחר", "ייצור", "תקלה", "עצירה"];

type ColorPickerProps = {
  value: string;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (hex: string) => void;
  disabled?: boolean;
};

const ColorPicker = ({
  value,
  isOpen,
  onToggle,
  onSelect,
  disabled = false,
}: ColorPickerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onToggle();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onToggle]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape" && isOpen) {
      onToggle();
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label="בחירת צבע"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-muted/50 transition-all hover:bg-muted hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:pointer-events-none"
      >
        <span
          aria-hidden
          className="h-4 w-4 rounded-sm shadow-sm"
          style={{ backgroundColor: value }}
        />
      </button>
      {isOpen && (
        <div
          role="listbox"
          className="absolute left-0 bottom-full z-50 mb-2 w-[180px] rounded-lg border border-input bg-popover p-2 shadow-lg"
        >
          <div className="grid grid-cols-5 gap-1.5">
            {ALLOWED_STATUS_COLORS.map((hex) => (
              <button
                key={hex}
                type="button"
                role="option"
                aria-selected={value === hex}
                aria-label={`צבע ${hex}`}
                onClick={() => onSelect(hex)}
                className={`h-7 w-7 rounded-md border-2 transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                  value === hex
                    ? "border-white ring-2 ring-primary"
                    : "border-transparent hover:border-white/50"
                }`}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const REPORT_TYPE_OPTIONS: {
  value: StatusReportType;
  label: string;
  shortLabel: string;
  icon: typeof FileX;
  activeClass: string;
}[] = [
  {
    value: "none",
    label: "ללא דיווח",
    shortLabel: "ללא",
    icon: FileX,
    activeClass: "bg-slate-600 text-white border-slate-500",
  },
  {
    value: "malfunction",
    label: "דיווח תקלה",
    shortLabel: "תקלה",
    icon: AlertTriangle,
    activeClass: "bg-red-600 text-white border-red-500",
  },
  {
    value: "general",
    label: "דיווח כללי",
    shortLabel: "כללי",
    icon: FileText,
    activeClass: "bg-blue-600 text-white border-blue-500",
  },
];

type ReportTypeToggleProps = {
  value: StatusReportType;
  onChange: (value: StatusReportType) => void;
  disabled?: boolean;
};

const ReportTypeToggle = ({ value, onChange, disabled = false }: ReportTypeToggleProps) => {
  return (
    <div className="flex items-center rounded-md border border-input bg-muted/30 p-0.5">
      {REPORT_TYPE_OPTIONS.map((option) => {
        const Icon = option.icon;
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            title={option.label}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-all ${
              isActive
                ? option.activeClass
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <Icon className="h-3 w-3" />
            <span className="hidden sm:inline">{option.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
};

type StatusCardProps = {
  status: StatusDefinition;
  onUpdateField: (
    id: string,
    key: "label_he" | "label_ru" | "color_hex" | "machine_state" | "report_type",
    value: string | boolean,
  ) => void;
  onRemove: (status: StatusDefinition) => void;
  isColorPickerOpen: boolean;
  onToggleColorPicker: () => void;
  onSelectColor: (hex: string) => void;
  disabled?: boolean;
  compact?: boolean;
};

export const StatusCard = ({
  status,
  onUpdateField,
  onRemove,
  isColorPickerOpen,
  onToggleColorPicker,
  onSelectColor,
  disabled = false,
  compact = false,
}: StatusCardProps) => {
  const isProtected = PROTECTED_LABELS_HE.includes(status.label_he);
  const isDisabled = disabled || isProtected;

  return (
    <div
      className={`group relative rounded-lg border transition-all ${
        isProtected
          ? "border-muted/50 bg-muted/20"
          : "border-input bg-secondary/50 hover:border-input/80"
      } ${compact ? "p-2.5" : "p-3"}`}
    >
      {/* Protected indicator */}
      {isProtected && (
        <div className="absolute -top-2 right-3 flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
          <Lock className="h-2.5 w-2.5" />
          <span>מוגן</span>
        </div>
      )}

      {/* Row 1: Name inputs */}
      <div className={`flex gap-2 ${compact ? "flex-col sm:flex-row" : "flex-col md:flex-row"}`}>
        {/* Hebrew name */}
        <div className="relative flex-1 min-w-0">
          <Label className="sr-only">שם בעברית</Label>
          <Input
            value={status.label_he}
            onChange={(e) => onUpdateField(status.id, "label_he", e.target.value)}
            disabled={isDisabled}
            placeholder="שם סטטוס"
            className={`h-9 pr-8 text-sm text-right border-input bg-muted/50 text-foreground placeholder:text-muted-foreground disabled:opacity-60 ${
              isProtected ? "cursor-not-allowed" : ""
            }`}
            aria-label="שם סטטוס בעברית"
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs opacity-60">
            HE
          </span>
        </div>

        {/* Russian name */}
        <div className="relative flex-1 min-w-0">
          <Label className="sr-only">שם ברוסית</Label>
          <Input
            value={status.label_ru ?? ""}
            onChange={(e) => onUpdateField(status.id, "label_ru", e.target.value)}
            disabled={isDisabled}
            placeholder="Название"
            className={`h-9 pr-8 text-sm text-right border-input bg-muted/50 text-foreground placeholder:text-muted-foreground disabled:opacity-60 ${
              isProtected ? "cursor-not-allowed" : ""
            }`}
            aria-label="שם סטטוס ברוסית"
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs opacity-60">
            RU
          </span>
        </div>
      </div>

      {/* Row 2: Controls */}
      <div className={`flex items-center justify-between gap-2 ${compact ? "mt-2" : "mt-3"}`}>
        {/* Left side: Color + Machine State + Malfunction toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          <ColorPicker
            value={status.color_hex ?? "#0ea5e9"}
            isOpen={isColorPickerOpen}
            onToggle={onToggleColorPicker}
            onSelect={onSelectColor}
            disabled={isDisabled}
          />

          <Select
            value={status.machine_state ?? "production"}
            onValueChange={(value) => onUpdateField(status.id, "machine_state", value)}
            disabled={isDisabled}
          >
            <SelectTrigger
              className={`h-8 w-[90px] text-xs border-input bg-muted/50 ${
                isProtected ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(MACHINE_STATE_LABELS) as MachineState[]).map((state) => (
                <SelectItem key={state} value={state} className="text-xs">
                  {MACHINE_STATE_LABELS[state]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {status.machine_state === "stoppage" && (
            <ReportTypeToggle
              value={(status.report_type as StatusReportType) ?? "none"}
              onChange={(value) => onUpdateField(status.id, "report_type", value)}
              disabled={isDisabled}
            />
          )}
        </div>

        {/* Right side: Delete button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={isProtected ? "לא ניתן למחוק סטטוס מוגן" : "מחיקת סטטוס"}
          onClick={() => onRemove(status)}
          disabled={isDisabled}
          className={`h-8 w-8 shrink-0 ${
            isProtected
              ? "opacity-30 cursor-not-allowed text-muted-foreground"
              : "text-red-400 hover:text-red-300 hover:bg-red-500/10"
          }`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export { PROTECTED_LABELS_HE };
