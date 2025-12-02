"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LANGUAGE,
  type SupportedLanguage,
} from "@/lib/i18n/translations";

type LanguageContextValue = {
  language: SupportedLanguage;
  setLanguage: (next: SupportedLanguage) => void;
};

const STORAGE_KEY = "gestelit/lang";

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined,
);

type LanguageProviderProps = {
  children: ReactNode;
  initialLanguage?: SupportedLanguage;
};

export function LanguageProvider({
  children,
  initialLanguage = DEFAULT_LANGUAGE,
}: LanguageProviderProps) {
  const [language, setLanguage] = useState<SupportedLanguage>(() => {
    if (typeof window === "undefined") {
      return initialLanguage;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY) as
      | SupportedLanguage
      | null;
    return stored ?? initialLanguage;
  });

  const updateLanguage = (next: SupportedLanguage) => {
    setLanguage(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  };

  const value = useMemo(
    () => ({
      language,
      setLanguage: updateLanguage,
    }),
    [language],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}

