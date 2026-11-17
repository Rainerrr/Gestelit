import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
  showThemeToggle?: boolean;
};

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  showThemeToggle = true,
}: PageHeaderProps) {
  return (
    <header className="border-b border-border bg-card px-5 py-5 sm:px-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2 text-right">
          {eyebrow ? (
            <p className="text-xs font-semibold text-primary">{eyebrow}</p>
          ) : null}
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold leading-tight text-foreground">
              {title}
            </h1>
            {subtitle ? (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-right">
          {actions}
          {showThemeToggle ? <ThemeToggle /> : null}
        </div>
      </div>
    </header>
  );
}

