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
      <Label htmlFor={id} className="text-sm font-medium text-slate-700">
        {resolvedLabel}
      </Label>
      <Select value={language} onValueChange={handleChange}>
        <SelectTrigger
          id={id}
          aria-label={resolvedLabel}
          className="justify-between text-right"
        >
          <SelectValue placeholder={resolvedLabel} />
        </SelectTrigger>
        <SelectContent align="end" className="text-right">
          {Object.entries(supportedLanguages).map(([code, text]) => (
            <SelectItem key={code} value={code} className="text-right">
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

