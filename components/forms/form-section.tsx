import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ReactNode } from "react";

type FormSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function FormSection({
  title,
  description,
  children,
  footer,
}: FormSectionProps) {
  return (
    <Card className="border border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-1 text-right">
        <CardTitle className="text-lg font-semibold text-slate-900">
          {title}
        </CardTitle>
        {description ? (
          <CardDescription className="text-slate-600">
            {description}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4 text-right">{children}</CardContent>
      {footer ? (
        <div className="border-t border-slate-100 bg-slate-50/60 p-6 text-right">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}

