"use client";

import { useCallback } from "react";
import { getTranslation, type TranslationKey } from "@/lib/i18n/translations";
import { useLanguage } from "@/contexts/LanguageContext";

type Interpolation = Record<string, string | number>;

function format(template: string, values?: Interpolation) {
  if (!values) {
    return template;
  }

  return Object.entries(values).reduce((acc, [key, value]) => {
    return acc.replaceAll(`{{${key}}}`, String(value));
  }, template);
}

export function useTranslation() {
  const { language, setLanguage } = useLanguage();

  const t = useCallback(
    (key: TranslationKey, values?: Interpolation) =>
      format(getTranslation(key, language), values),
    [language],
  );

  return { language, setLanguage, t };
}

