import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
};

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: PageHeaderProps) {
  return (
    <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2 text-right">
          {eyebrow ? (
            <p className="text-xs font-semibold text-primary">{eyebrow}</p>
          ) : null}
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold leading-tight text-slate-900">
              {title}
            </h1>
            {subtitle ? (
              <p className="text-sm text-slate-600">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex justify-end gap-2 text-right">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

