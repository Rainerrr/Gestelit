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
    <Card className="rounded-xl border border-border bg-card/50 backdrop-blur-sm">
      <CardHeader className="space-y-1 text-right">
        <CardTitle className="text-lg font-semibold text-card-foreground">
          {title}
        </CardTitle>
        {description ? (
          <CardDescription className="text-muted-foreground">
            {description}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4 text-right">{children}</CardContent>
      {footer ? (
        <div className="border-t border-border/60 bg-muted/30 p-6 text-right">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}

