"use client";

import { useMemo, useState, type KeyboardEventHandler } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const EMPTY_OPTION_VALUE = "__EMPTY_OPTION__";
const NO_OPTIONS_VALUE = "__NO_OPTIONS__";

type CreatableComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  ariaLabel?: string;
  emptyLabel?: string;
  allowEmpty?: boolean;
  inputPlaceholder?: string;
  helperText?: string;
  inputId?: string;
};

export const CreatableCombobox = ({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  emptyLabel = "ללא",
  allowEmpty = false,
  inputPlaceholder,
  helperText,
  inputId,
}: CreatableComboboxProps) => {
  const [customValue, setCustomValue] = useState("");
  const normalizedValue =
    allowEmpty && (value ?? "").trim() === "" ? EMPTY_OPTION_VALUE : value;
  const normalizedOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [value, ...options]
            .map((option) => option?.trim() ?? "")
            .filter((option) => option.length > 0),
        ),
      ),
    [options, value],
  );

  const handleSelectChange = (nextValue: string) => {
    if (allowEmpty && nextValue === EMPTY_OPTION_VALUE) {
      onChange("");
      return;
    }
    if (nextValue === NO_OPTIONS_VALUE) return;
    onChange(nextValue);
  };

  const handleCreate = () => {
    const trimmed = customValue.trim();
    if (!trimmed) return;
    onChange(trimmed);
    setCustomValue("");
  };

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleCreate();
    }
  };

  return (
    <div className="space-y-2">
      <Select value={normalizedValue} onValueChange={handleSelectChange}>
        <SelectTrigger aria-label={ariaLabel ?? placeholder} className="border-border bg-white text-foreground dark:bg-secondary">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="border-input bg-popover">
          {allowEmpty ? (
            <SelectItem value={EMPTY_OPTION_VALUE} className="text-foreground focus:bg-accent">{emptyLabel}</SelectItem>
          ) : null}
          {normalizedOptions.map((option) => (
            <SelectItem key={option} value={option} className="text-foreground focus:bg-accent">
              {option}
            </SelectItem>
          ))}
          {normalizedOptions.length === 0 && !allowEmpty ? (
            <SelectItem value={NO_OPTIONS_VALUE} disabled className="text-muted-foreground">
              אין אפשרויות
            </SelectItem>
          ) : null}
        </SelectContent>
      </Select>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={inputId}
          aria-label={ariaLabel ?? placeholder}
          placeholder={inputPlaceholder ?? "הקלד ערך חדש"}
          value={customValue}
          onChange={(event) => setCustomValue(event.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 border-border bg-white text-foreground placeholder:text-muted-foreground dark:bg-secondary"
        />
        <Button
          type="button"
          variant="outline"
          onClick={handleCreate}
          disabled={!customValue.trim()}
          className="border-border bg-white text-foreground/80 hover:bg-accent hover:text-foreground dark:bg-secondary"
        >
          הוספת חדש
        </Button>
      </div>
      {helperText ? (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      ) : null}
    </div>
  );
};

