"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/hooks/useTranslation";
import {
  supportedLanguages,
  type SupportedLanguage,
} from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

type LanguageSelectProps = {
  id?: string;
  label?: string;
  className?: string;
};

export function LanguageSelect({
  id = "language",
  label,
  className,
}: LanguageSelectProps) {
  const { language, setLanguage, t } = useTranslation();
  const resolvedLabel = label ?? t("common.language");

  const handleChange = (value: string) => {
    setLanguage(value as SupportedLanguage);
  };

  return (
    <div className={cn("space-y-2 text-right", className)}>
      <Label htmlFor={id} className="text-sm font-medium text-muted-foreground">
        {resolvedLabel}
      </Label>
      <Select value={language} onValueChange={handleChange}>
        <SelectTrigger
          id={id}
          aria-label={resolvedLabel}
          className="justify-between border-border bg-white text-right text-foreground dark:bg-secondary"
        >
          <SelectValue placeholder={resolvedLabel} />
        </SelectTrigger>
        <SelectContent align="end" className="border-input bg-popover text-right">
          {Object.entries(supportedLanguages).map(([code, text]) => (
            <SelectItem key={code} value={code} className="text-right text-foreground focus:bg-accent focus:text-accent-foreground">
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

